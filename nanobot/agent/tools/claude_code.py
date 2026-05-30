"""Claude Code tool: drive the headless `claude` CLI as a coding sub-agent.

Design (see docs/SKILL): each chat conversation maps to one persistent Claude
Code session (``--resume``) in its own working directory. Runs are headless
(``claude -p ... --output-format stream-json``) so nanobot owns the user
conversation and Claude's structured output never leaks back in as user input.

On a *pushable* channel (WhatsApp, Telegram, …) a run is a BACKGROUND job: the
tool returns immediately, streams throttled progress, and pushes the final
result via the bus when done — so a multi-minute run never holds the session
lock or blocks the user. On a request/response channel (the dashboard HTTP API,
CLI) there is no outbound consumer to push to, so the run is synchronous and the
final result is returned as the tool output.

Concurrency: one run per conversation at a time, and a global semaphore caps how
many Claude Code processes run at once across all conversations.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from loguru import logger

from nanobot.agent.tools.base import Tool, tool_parameters
from nanobot.agent.tools.schema import BooleanSchema, StringSchema, tool_parameters_schema
from nanobot.bus.events import OutboundMessage

# Channels with no persistent outbound consumer: deliver synchronously (return
# the result as the tool output) instead of pushing it onto the bus.
_SYNC_CHANNELS = frozenset({"", "cli", "api", "system"})
_MAX_RESULT_CHARS = 3500  # keep the final delivered message chat-friendly
_STREAM_READ_LIMIT = 16 * 1024 * 1024  # a single stream-json line can be large


def _resolve_user(user: str, group: str) -> tuple[int | None, int | None]:
    """Resolve a user/group name-or-id to numeric (uid, gid), or (None, None).

    When set, the claude subprocess is launched as this user — needed so it can
    run with bypassPermissions (Claude Code refuses that as root) and as
    defence-in-depth (the autonomous agent runs unprivileged)."""
    if not user:
        return None, None
    try:
        import pwd

        rec = pwd.getpwuid(int(user)) if user.isdigit() else pwd.getpwnam(user)
        uid, gid = rec.pw_uid, rec.pw_gid
    except Exception:
        # No passwd entry (or non-Unix): accept a bare uid, default gid to it.
        if user.isdigit():
            uid = int(user)
            gid = int(group) if group.isdigit() else uid
            return uid, gid
        logger.warning("claude_code: could not resolve subprocess_user {!r}; running as parent", user)
        return None, None
    if group:
        try:
            import grp

            gid = grp.getgrgid(int(group)).gr_gid if group.isdigit() else grp.getgrnam(group).gr_gid
        except Exception:
            gid = int(group) if group.isdigit() else gid
    return uid, gid


@dataclass
class _Result:
    session_id: str | None = None
    text: str = ""
    is_error: bool = False
    cost: float | None = None
    turns: int | None = None
    error: str | None = None  # set when the run failed/timed out (not a claude result)
    saw_result: bool = False  # a terminal 'result' event was actually parsed


@dataclass
class _Job:
    job_id: str
    conv_key: str
    channel: str
    chat_id: str
    started_at: float
    task: asyncio.Task | None = None
    proc: asyncio.subprocess.Process | None = None


@tool_parameters(
    tool_parameters_schema(
        action=StringSchema("What to do", enum=["run", "status", "stop"]),
        task=StringSchema(
            "The coding instruction for Claude Code (required for 'run'). Be specific; "
            "Claude Code works in this conversation's dedicated directory and remembers "
            "prior turns in the same conversation."
        ),
        new_session=BooleanSchema(
            description="Start a fresh Claude Code session instead of continuing this "
            "conversation's existing one (use when switching to an unrelated task).",
            default=False,
        ),
        required=["action"],
    )
)
class ClaudeCodeTool(Tool):
    """Run coding tasks through the headless Claude Code CLI."""

    def __init__(
        self,
        *,
        binary: str = "claude",
        workspace_root: Path | str,
        max_concurrent: int = 2,
        permission_mode: str = "acceptEdits",
        model: str = "",
        timeout: int = 1800,
        extra_args: list[str] | None = None,
        allowed_env_keys: list[str] | None = None,
        send_callback: Callable[[OutboundMessage], Awaitable[None]] | None = None,
        progress_interval: float = 10.0,
        restrict_to_workspace: bool = False,
        subprocess_user: str = "",
        subprocess_group: str = "",
        oauth_token: str = "",
        github_token: str = "",
        git_user_name: str = "",
        git_user_email: str = "",
    ) -> None:
        self._binary = binary
        self._root = Path(workspace_root)
        self._permission_mode = permission_mode
        self._model = model
        self._timeout = timeout
        self._extra_args = list(extra_args or [])
        self._allowed_env_keys = list(allowed_env_keys or [])
        self._send = send_callback
        self._progress_interval = progress_interval
        self._restrict_to_workspace = restrict_to_workspace
        self._oauth_token = oauth_token
        self._github_token = github_token
        self._git_user_name = git_user_name
        self._git_user_email = git_user_email
        self._gitconfig_path = self._root / ".gitconfig"
        self._gh_config_dir = self._root / ".config" / "gh"
        self._run_uid, self._run_gid = _resolve_user(subprocess_user, subprocess_group)
        if self._github_token:
            self._write_gitconfig()

        self._sem = asyncio.Semaphore(max(1, max_concurrent))
        # Per-conversation state (keyed by "channel:chat_id").
        self._active: dict[str, _Job] = {}
        self._claude_session: dict[str, str] = {}
        self._seq = 0
        self._map_lock = asyncio.Lock()
        # Task-local routing context so concurrent sessions can't clobber each
        # other's delivery target (the tool instance is shared across sessions).
        self._ctx: ContextVar[tuple[str, str]] = ContextVar("claude_ctx", default=("", ""))

        self._sessions_path = self._root / "sessions.json"
        self._load_sessions()

    # ── Tool identity ────────────────────────────────────────────────

    @property
    def name(self) -> str:
        return "claude_code"

    @property
    def description(self) -> str:
        return (
            "Delegate a coding task to Claude Code (a headless coding agent that can read, "
            "write and run code in this conversation's dedicated workspace). "
            "actions: 'run' (start/continue a task — runs in the background on chat channels "
            "and reports progress + the result back here), 'status' (is a task running?), "
            "'stop' (cancel the running task). Each conversation keeps its own Claude Code "
            "memory across turns; pass new_session=true to start fresh."
        )

    def set_context(self, channel: str, chat_id: str) -> None:
        """Called by the agent loop before each turn; task-local, not shared."""
        self._ctx.set((channel or "", chat_id or ""))

    # ── Routing helpers ──────────────────────────────────────────────

    @staticmethod
    def _conv_key(channel: str, chat_id: str) -> str:
        return f"{channel}:{chat_id}"

    def _workdir(self, conv_key: str) -> Path:
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", conv_key) or "default"
        d = self._root / "work" / safe
        d.mkdir(parents=True, exist_ok=True)
        d = d.resolve()
        # When we drop privileges for the subprocess, the work dir (created by
        # the parent, often root) must be writable by that user.
        if self._run_uid is not None:
            try:
                os.chown(d, self._run_uid, self._run_gid if self._run_gid is not None else -1)
            except OSError:
                logger.debug("claude_code: could not chown workdir {}", d)
        return d

    def _write_gitconfig(self) -> None:
        """Write a git global config for the subprocess: commit identity plus the
        GitHub CLI as the HTTPS credential helper (so clone/push/PR use GH_TOKEN)."""
        try:
            self._gh_config_dir.mkdir(parents=True, exist_ok=True)
            lines: list[str] = []
            if self._git_user_name or self._git_user_email:
                lines.append("[user]")
                if self._git_user_name:
                    lines.append(f"\tname = {self._git_user_name}")
                if self._git_user_email:
                    lines.append(f"\temail = {self._git_user_email}")
            lines += [
                '[credential "https://github.com"]',
                "\thelper = !gh auth git-credential",
                "[init]",
                "\tdefaultBranch = main",
                "[safe]",
                "\tdirectory = *",
            ]
            self._gitconfig_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            if self._run_uid is not None:
                gid = self._run_gid if self._run_gid is not None else -1
                for p in (self._gitconfig_path, self._gh_config_dir, self._gh_config_dir.parent):
                    try:
                        os.chown(p, self._run_uid, gid)
                    except OSError:
                        pass
        except OSError:
            logger.warning("claude_code: could not write gitconfig at {}", self._gitconfig_path)

    def _build_env(self) -> dict[str, str]:
        env: dict[str, str] = {}
        for k in ("PATH", "HOME", "LANG", "TERM", "NODE_PATH", "SHELL"):
            v = os.environ.get(k)
            if v is not None:
                env[k] = v
        # Persist Claude Code's own session store on the data volume so
        # --resume survives container restarts.
        env["CLAUDE_CONFIG_DIR"] = str(self._root / ".claude")
        if self._oauth_token:
            env["CLAUDE_CODE_OAUTH_TOKEN"] = self._oauth_token
        if self._github_token:
            # gh authenticates from GH_TOKEN; git uses `gh auth git-credential`
            # (configured in the gitconfig below) for HTTPS clone/push/PR.
            env["GH_TOKEN"] = self._github_token
            env["GH_CONFIG_DIR"] = str(self._gh_config_dir)
            env["GIT_CONFIG_GLOBAL"] = str(self._gitconfig_path)
        for k in self._allowed_env_keys:
            v = os.environ.get(k)
            if v is not None:
                env[k] = v
        return env

    # ── Session-id persistence ───────────────────────────────────────

    def _load_sessions(self) -> None:
        try:
            if self._sessions_path.exists():
                data = json.loads(self._sessions_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    self._claude_session = {str(k): str(v) for k, v in data.items()}
        except Exception:
            logger.warning("claude_code: failed to load session map; starting empty")

    async def _persist_sessions(self) -> None:
        async with self._map_lock:
            try:
                self._root.mkdir(parents=True, exist_ok=True)
                self._sessions_path.write_text(
                    json.dumps(self._claude_session, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            except Exception:
                logger.warning("claude_code: failed to persist session map")

    # ── Entry point ──────────────────────────────────────────────────

    async def execute(
        self,
        action: str = "run",
        task: str = "",
        new_session: bool = False,
        **kwargs: Any,
    ) -> str:
        # Capture routing FIRST, before any await, so a concurrent session's
        # context update can't redirect this call.
        channel, chat_id = self._ctx.get()
        conv_key = self._conv_key(channel, chat_id)

        if action == "status":
            return self._status(conv_key)
        if action == "stop":
            return await self._stop(conv_key)
        if action != "run":
            return f"Error: unknown action '{action}'"

        if not task.strip():
            return "Error: 'task' is required for action 'run'."
        if not chat_id and channel not in _SYNC_CHANNELS:
            return "Error: no conversation context to run Claude Code in."

        existing = self._active.get(conv_key)
        if existing and existing.task and not existing.task.done():
            ago = int(time.monotonic() - existing.started_at)
            return (
                f"A Claude Code task is already running for this chat (started {ago}s ago, "
                f"job {existing.job_id}). Wait for it to finish, or use action 'stop' to cancel it."
            )

        self._seq += 1
        job = _Job(
            job_id=f"cc{self._seq}",
            conv_key=conv_key,
            channel=channel,
            chat_id=chat_id,
            started_at=time.monotonic(),
        )

        # Synchronous channels (HTTP API / CLI) have nowhere to push to later,
        # so run inline and return the result as the tool output.
        if channel in _SYNC_CHANNELS or self._send is None:
            self._active[conv_key] = job
            try:
                result = await self._run(job, task, new_session, on_progress=None)
            finally:
                self._active.pop(conv_key, None)
            return self._format_result(result)

        # Pushable channel: background job + progress/result pushed to the chat.
        job.task = asyncio.create_task(self._background(job, task, new_session))
        self._active[conv_key] = job
        return (
            f"Started Claude Code (job {job.job_id}) in this conversation's workspace. "
            "I'll post progress here and send the result when it's done. "
            "Tell the user you've started and will report back; do not wait."
        )

    # ── Background runner (pushable channels) ────────────────────────

    async def _background(self, job: _Job, task: str, new_session: bool) -> None:
        async def on_progress(text: str) -> None:
            await self._push(job, text)

        try:
            result = await self._run(job, task, new_session, on_progress=on_progress)
            await self._push(job, self._format_result(result))
        except asyncio.CancelledError:
            await self._push(job, f"🛑 Claude Code job {job.job_id} cancelled.")
        except Exception as e:
            logger.exception("claude_code: background job {} crashed", job.job_id)
            await self._push(job, f"⚠️ Claude Code job {job.job_id} failed: {e}")
        finally:
            # Only clear if we're still the active job (a stop+restart may have replaced us).
            if self._active.get(job.conv_key) is job:
                self._active.pop(job.conv_key, None)

    async def _push(self, job: _Job, content: str) -> None:
        if not self._send or not content:
            return
        try:
            await self._send(OutboundMessage(channel=job.channel, chat_id=job.chat_id, content=content))
        except Exception:
            logger.exception("claude_code: failed to push update for job {}", job.job_id)

    # ── Core claude invocation ───────────────────────────────────────

    async def _run(
        self,
        job: _Job,
        task: str,
        new_session: bool,
        on_progress: Callable[[str], Awaitable[None]] | None,
    ) -> _Result:
        result = _Result()
        async with self._sem:
            workdir = self._workdir(job.conv_key)
            resume = None if new_session else self._claude_session.get(job.conv_key)

            cmd = [
                self._binary, "-p", task,
                "--output-format", "stream-json", "--verbose",
                "--permission-mode", self._permission_mode,
            ]
            if self._model:
                cmd += ["--model", self._model]
            if resume:
                cmd += ["--resume", resume]
            if self._restrict_to_workspace:
                # Explicitly scope Claude Code's file access to this
                # conversation's directory (defence-in-depth alongside cwd; not a
                # hard sandbox — pair with OS-level confinement and a non-bypass
                # permission mode for untrusted use).
                cmd += ["--add-dir", str(workdir)]
            cmd += self._extra_args

            spawn_kw: dict[str, Any] = {}
            if self._run_uid is not None:
                spawn_kw["user"] = self._run_uid
                if self._run_gid is not None:
                    spawn_kw["group"] = self._run_gid
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    cwd=str(workdir),
                    env=self._build_env(),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    limit=_STREAM_READ_LIMIT,
                    **spawn_kw,
                )
            except FileNotFoundError:
                result.error = (
                    f"Claude Code binary '{self._binary}' not found. "
                    "Install it (npm i -g @anthropic-ai/claude-code) and ensure it's on PATH."
                )
                return result
            job.proc = proc

            stderr_buf: list[bytes] = []
            stderr_task = asyncio.create_task(self._drain(proc.stderr, stderr_buf))
            try:
                await asyncio.wait_for(
                    self._consume(proc, result, on_progress), timeout=self._timeout
                )
                await proc.wait()
            except asyncio.TimeoutError:
                await self._kill(proc)
                result.error = f"timed out after {self._timeout}s"
            except asyncio.CancelledError:
                await self._kill(proc)
                raise
            finally:
                stderr_task.cancel()
                job.proc = None

            if result.error is None and result.session_id:
                self._claude_session[job.conv_key] = result.session_id
                await self._persist_sessions()

            # Fail loud if no terminal 'result' event arrived (a crash, OR a
            # clean exit that produced nothing) — otherwise an empty run would
            # render as a ✅ success. Gate on saw_result, NOT session_id (which
            # the earlier 'init' event already populated).
            if result.error is None and not result.saw_result:
                tail = b"".join(stderr_buf)[-500:].decode("utf-8", "replace").strip()
                rc = proc.returncode
                if rc not in (0, None):
                    result.error = f"claude exited {rc}" + (f": {tail}" if tail else "")
                else:
                    result.error = "claude exited without a result" + (f": {tail}" if tail else "")

        return result

    async def _consume(
        self,
        proc: asyncio.subprocess.Process,
        result: _Result,
        on_progress: Callable[[str], Awaitable[None]] | None,
    ) -> None:
        assert proc.stdout is not None
        last_emit = 0.0
        while True:
            try:
                raw = await proc.stdout.readline()
            except asyncio.LimitOverrunError:
                # readline() leaves the over-limit data in the buffer, so a bare
                # `continue` would busy-loop re-raising on the same bytes. Drain a
                # chunk to make progress (the oversized line is lost); the next
                # newline resyncs the stream.
                logger.debug("claude_code: stream line exceeded {} bytes; draining", _STREAM_READ_LIMIT)
                try:
                    await proc.stdout.read(_STREAM_READ_LIMIT)
                except Exception:
                    break
                continue
            except ValueError:
                continue
            if not raw:
                break
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                evt = json.loads(line)
            except json.JSONDecodeError:
                logger.debug("claude_code: skipping non-JSON stream line: {}", line[:120])
                continue
            etype = evt.get("type")
            if etype == "system" and evt.get("subtype") == "init":
                result.session_id = evt.get("session_id") or result.session_id
            elif etype == "assistant":
                note = self._summarize_assistant(evt.get("message", {}))
                if note and on_progress:
                    now = time.monotonic()
                    if now - last_emit >= self._progress_interval:
                        last_emit = now
                        await on_progress(note)
            elif etype == "result":
                result.session_id = evt.get("session_id") or result.session_id
                result.text = evt.get("result") or result.text
                result.is_error = bool(evt.get("is_error"))
                result.cost = evt.get("total_cost_usd")
                result.turns = evt.get("num_turns")
                result.saw_result = True

    @staticmethod
    async def _drain(stream: asyncio.StreamReader | None, into: list[bytes]) -> None:
        if stream is None:
            return
        try:
            async for chunk in stream:
                into.append(chunk)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.debug("claude_code: stderr drain ended early")

    @staticmethod
    async def _kill(proc: asyncio.subprocess.Process) -> None:
        if proc.returncode is not None:
            return
        try:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                proc.kill()
                await asyncio.wait_for(proc.wait(), timeout=5.0)
        except (ProcessLookupError, asyncio.TimeoutError):
            pass

    # ── Formatting / status / stop ───────────────────────────────────

    @staticmethod
    def _summarize_assistant(message: dict[str, Any]) -> str | None:
        """Turn an assistant event into one short progress line, or None."""
        content = message.get("content")
        if not isinstance(content, list):
            return None
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_use":
                name = block.get("name", "tool")
                inp = block.get("input", {}) if isinstance(block.get("input"), dict) else {}
                target = (
                    inp.get("file_path") or inp.get("path") or inp.get("pattern")
                    or inp.get("command") or inp.get("url") or ""
                )
                target = str(target).splitlines()[0][:60] if target else ""
                return f"🔧 {name}: {target}".strip().rstrip(":")
        return None

    def _format_result(self, r: _Result) -> str:
        if r.error:
            return f"⚠️ Claude Code: {r.error}"
        text = r.text.strip() or "(Claude Code finished with no text output.)"
        if len(text) > _MAX_RESULT_CHARS:
            text = text[:_MAX_RESULT_CHARS] + f"\n…[+{len(text) - _MAX_RESULT_CHARS} chars]"
        footer = "✅" if not r.is_error else "⚠️ error"
        if r.turns:
            footer += f" · {r.turns} turns"
        if isinstance(r.cost, (int, float)):
            footer += f" · ${r.cost:.2f}"
        return f"{text}\n\n— Claude Code {footer}"

    def _status(self, conv_key: str) -> str:
        job = self._active.get(conv_key)
        if job and job.task and not job.task.done():
            ago = int(time.monotonic() - job.started_at)
            return f"Claude Code job {job.job_id} is running ({ago}s elapsed)."
        if job and (job.proc is not None):
            ago = int(time.monotonic() - job.started_at)
            return f"Claude Code job {job.job_id} is running ({ago}s elapsed)."
        has = "yes" if conv_key in self._claude_session else "no"
        return f"No Claude Code task running. Prior session for this chat: {has}."

    async def _stop(self, conv_key: str) -> str:
        job = self._active.get(conv_key)
        if not job:
            return "No Claude Code task is running for this chat."
        if job.proc is not None:
            await self._kill(job.proc)
        if job.task and not job.task.done():
            job.task.cancel()
        self._active.pop(conv_key, None)
        return f"Stopping Claude Code job {job.job_id}."

    async def aclose(self) -> None:
        """Cancel any in-flight jobs (call on shutdown)."""
        for job in list(self._active.values()):
            if job.proc is not None:
                await self._kill(job.proc)
            if job.task and not job.task.done():
                job.task.cancel()
        self._active.clear()
