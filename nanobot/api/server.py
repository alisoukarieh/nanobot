"""OpenAI-compatible HTTP API server for a fixed nanobot session.

Provides /v1/chat/completions and /v1/models endpoints.
All requests route to a single persistent API session.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

from aiohttp import web
from loguru import logger

from nanobot.utils.runtime import EMPTY_FINAL_RESPONSE_MESSAGE

API_SESSION_KEY = "api:default"
API_CHAT_ID = "default"


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _error_json(status: int, message: str, err_type: str = "invalid_request_error") -> web.Response:
    return web.json_response(
        {"error": {"message": message, "type": err_type, "code": status}},
        status=status,
    )


def _chat_completion_response(content: str, model: str) -> dict[str, Any]:
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def _chunk(completion_id: str, model: str, delta: dict[str, Any], finish_reason: str | None = None) -> dict[str, Any]:
    return {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }


def _response_text(value: Any) -> str:
    """Normalize process_direct output to plain assistant text."""
    if value is None:
        return ""
    if hasattr(value, "content"):
        return str(getattr(value, "content") or "")
    return str(value)


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------

async def _handle_stream(
    *,
    request: web.Request,
    agent_loop,
    session_key: str,
    session_lock: asyncio.Lock,
    user_content: str,
    model_name: str,
    model_override: str | None,
    timeout_s: float,
    fallback: str,
) -> web.StreamResponse:
    """Run process_direct with streaming callbacks and emit OpenAI-compatible SSE."""

    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
    await response.prepare(request)

    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"

    async def write(event: dict[str, Any]) -> None:
        await response.write(f"data: {json.dumps(event)}\n\n".encode("utf-8"))

    # OpenAI-style opening chunk: role marker. The dashboard also treats any
    # further role chunk as a reset signal (tool-call round boundary).
    await write(_chunk(completion_id, model_name, {"role": "assistant"}))

    # Bridge hook callbacks -> SSE via a queue so the runner task stays decoupled
    # from response I/O.
    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

    async def on_stream(delta: str) -> None:
        await queue.put(("delta", delta))

    async def on_stream_end(*, resuming: bool = False) -> None:
        await queue.put(("end", resuming))

    async def run() -> None:
        try:
            async with session_lock:
                try:
                    result = await asyncio.wait_for(
                        agent_loop.process_direct(
                            content=user_content,
                            session_key=session_key,
                            channel="api",
                            chat_id=API_CHAT_ID,
                            on_stream=on_stream,
                            on_stream_end=on_stream_end,
                            model_override=model_override,
                        ),
                        timeout=timeout_s,
                    )
                    await queue.put(("done", _response_text(result)))
                except asyncio.TimeoutError:
                    await queue.put(("error", f"Request timed out after {timeout_s}s"))
                except Exception as e:
                    logger.exception("Streaming error for session {}", session_key)
                    await queue.put(("error", str(e) or "Internal server error"))
        except Exception:
            logger.exception("Unexpected API lock error for session {}", session_key)
            await queue.put(("error", "Internal server error"))

    runner_task = asyncio.create_task(run())
    streamed_any = False

    try:
        while True:
            kind, value = await queue.get()
            if kind == "delta":
                if not value:
                    continue
                streamed_any = True
                await write(_chunk(completion_id, model_name, {"content": value}))
            elif kind == "end":
                resuming = bool(value)
                if resuming:
                    # Tool-call round boundary — tell the client to clear any
                    # buffered pre-tool content (matches the CLI renderer).
                    streamed_any = False
                    await write(_chunk(completion_id, model_name, {"role": "assistant"}))
            elif kind == "done":
                final_text = value or ""
                if not streamed_any and final_text.strip():
                    await write(_chunk(completion_id, model_name, {"content": final_text}))
                    streamed_any = True
                if not streamed_any:
                    await write(_chunk(completion_id, model_name, {"content": fallback}))
                await write(_chunk(completion_id, model_name, {}, finish_reason="stop"))
                await response.write(b"data: [DONE]\n\n")
                break
            elif kind == "error":
                err_payload = {
                    "error": {
                        "message": value,
                        "type": "server_error",
                    }
                }
                await response.write(f"data: {json.dumps(err_payload)}\n\n".encode("utf-8"))
                await response.write(b"data: [DONE]\n\n")
                break
    finally:
        if not runner_task.done():
            runner_task.cancel()
            try:
                await runner_task
            except (asyncio.CancelledError, Exception):
                pass
        await response.write_eof()

    return response


async def handle_chat_completions(request: web.Request) -> web.Response:
    """POST /v1/chat/completions"""

    # --- Parse body ---
    try:
        body = await request.json()
    except Exception:
        return _error_json(400, "Invalid JSON body")

    messages = body.get("messages")
    if not isinstance(messages, list) or len(messages) != 1:
        return _error_json(400, "Only a single user message is supported")

    stream_mode = bool(body.get("stream", False))
    if stream_mode and body.get("tts"):
        return _error_json(400, "stream=true is not supported together with tts=true")

    message = messages[0]
    if not isinstance(message, dict) or message.get("role") != "user":
        return _error_json(400, "Only a single user message is supported")
    user_content = message.get("content", "")
    if isinstance(user_content, list):
        # Multi-modal content array — extract text parts
        user_content = " ".join(
            part.get("text", "") for part in user_content if part.get("type") == "text"
        )

    agent_loop = request.app["agent_loop"]
    timeout_s: float = request.app.get("request_timeout", 120.0)
    default_model_name: str = request.app.get("model_name", "nanobot")
    requested_model = body.get("model")
    # Only treat as an override when it's a real model id (contains "/"),
    # not the placeholder reported by /v1/models.
    model_override = (
        requested_model
        if isinstance(requested_model, str) and "/" in requested_model and requested_model != default_model_name
        else None
    )
    model_name = model_override or default_model_name

    session_key = f"api:{body['session_id']}" if body.get("session_id") else API_SESSION_KEY
    session_locks: dict[str, asyncio.Lock] = request.app["session_locks"]
    session_lock = session_locks.setdefault(session_key, asyncio.Lock())

    logger.info("API request session_key={} content={} stream={}", session_key, user_content[:80], stream_mode)

    _FALLBACK = EMPTY_FINAL_RESPONSE_MESSAGE

    if stream_mode:
        return await _handle_stream(
            request=request,
            agent_loop=agent_loop,
            session_key=session_key,
            session_lock=session_lock,
            user_content=user_content,
            model_name=model_name,
            model_override=model_override,
            timeout_s=timeout_s,
            fallback=_FALLBACK,
        )

    try:
        async with session_lock:
            try:
                response = await asyncio.wait_for(
                    agent_loop.process_direct(
                        content=user_content,
                        session_key=session_key,
                        channel="api",
                        chat_id=API_CHAT_ID,
                        model_override=model_override,
                    ),
                    timeout=timeout_s,
                )
                response_text = _response_text(response)

                if not response_text or not response_text.strip():
                    logger.warning(
                        "Empty response for session {}, retrying",
                        session_key,
                    )
                    retry_response = await asyncio.wait_for(
                        agent_loop.process_direct(
                            content=user_content,
                            session_key=session_key,
                            channel="api",
                            chat_id=API_CHAT_ID,
                        ),
                        timeout=timeout_s,
                    )
                    response_text = _response_text(retry_response)
                    if not response_text or not response_text.strip():
                        logger.warning(
                            "Empty response after retry for session {}, using fallback",
                            session_key,
                        )
                        response_text = _FALLBACK

            except asyncio.TimeoutError:
                return _error_json(504, f"Request timed out after {timeout_s}s")
            except Exception:
                logger.exception("Error processing request for session {}", session_key)
                return _error_json(500, "Internal server error", err_type="server_error")
    except Exception:
        logger.exception("Unexpected API lock error for session {}", session_key)
        return _error_json(500, "Internal server error", err_type="server_error")

    # Optional TTS: when body has "tts": true, return an audio file instead of JSON text.
    if body.get("tts"):
        groq_key = request.app.get("groq_api_key", "")
        if not groq_key:
            return _error_json(503, "TTS not configured (missing providers.groq.apiKey)")
        from nanobot.providers.transcription import GroqTtsProvider, DEFAULT_TTS_FORMAT, DEFAULT_TTS_VOICE
        voice = body.get("tts_voice") or DEFAULT_TTS_VOICE
        fmt = body.get("tts_format") or DEFAULT_TTS_FORMAT
        result = await GroqTtsProvider(api_key=groq_key).synthesize(response_text, voice=voice, fmt=fmt)
        if result is None:
            return _error_json(502, "TTS generation failed")
        audio_bytes, mime = result
        return web.Response(
            body=audio_bytes,
            content_type=mime,
            headers={
                "X-Nanobot-Transcript": response_text[:2000],
                "X-Nanobot-Model": model_name,
                "Content-Disposition": f'inline; filename="reply.{fmt}"',
            },
        )

    return web.json_response(_chat_completion_response(response_text, model_name))


async def handle_models(request: web.Request) -> web.Response:
    """GET /v1/models"""
    model_name = request.app.get("model_name", "nanobot")
    return web.json_response({
        "object": "list",
        "data": [
            {
                "id": model_name,
                "object": "model",
                "created": 0,
                "owned_by": "nanobot",
            }
        ],
    })


async def handle_health(request: web.Request) -> web.Response:
    """GET /health"""
    return web.json_response({"status": "ok"})


async def handle_restart(request: web.Request) -> web.Response:
    """POST /restart — restart the nanobot process."""
    import os
    import sys
    import asyncio

    async def _do_restart():
        await asyncio.sleep(0.5)
        os.execv(sys.executable, [sys.executable, "-m", "nanobot"] + sys.argv[1:])

    asyncio.create_task(_do_restart())
    return web.json_response({"status": "restarting"})


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

@web.middleware
async def cors_middleware(request: web.Request, handler):
    """Handle CORS preflight and add headers to all responses."""
    if request.method == "OPTIONS":
        return web.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type",
                "Access-Control-Max-Age": "86400",
            },
        )
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@web.middleware
async def api_key_middleware(request: web.Request, handler):
    """Reject requests without a valid API key when one is configured."""
    api_key = request.app.get("api_key", "")
    if api_key and request.path != "/health":
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:].strip() != api_key:
            return _error_json(401, "Invalid or missing API key", "authentication_error")
    return await handler(request)


def create_app(
    agent_loop,
    model_name: str = "nanobot",
    request_timeout: float = 120.0,
    api_key: str = "",
    groq_api_key: str = "",
) -> web.Application:
    """Create the aiohttp application.

    Args:
        agent_loop: An initialized AgentLoop instance.
        model_name: Model name reported in responses.
        request_timeout: Per-request timeout in seconds.
        api_key: If set, requests must include Authorization: Bearer <key>.
        groq_api_key: Enables "tts": true on /v1/chat/completions when set.
    """
    app = web.Application(middlewares=[cors_middleware, api_key_middleware])
    app["agent_loop"] = agent_loop
    app["model_name"] = model_name
    app["request_timeout"] = request_timeout
    app["session_locks"] = {}  # per-user locks, keyed by session_key
    app["api_key"] = api_key
    app["groq_api_key"] = groq_api_key

    app.router.add_post("/v1/chat/completions", handle_chat_completions)
    app.router.add_get("/v1/models", handle_models)
    app.router.add_get("/health", handle_health)
    app.router.add_post("/restart", handle_restart)
    return app
