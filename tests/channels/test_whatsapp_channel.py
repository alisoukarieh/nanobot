"""Tests for WhatsApp channel outbound media support."""

import json
import os
import sys
import types
from unittest.mock import AsyncMock, MagicMock

import pytest

from nanobot.bus.events import OutboundMessage
from nanobot.channels.whatsapp import (
    WhatsAppChannel,
    _load_or_create_bridge_token,
)


def _make_channel() -> WhatsAppChannel:
    bus = MagicMock()
    ch = WhatsAppChannel({"enabled": True}, bus)
    ch._ws = AsyncMock()
    ch._connected = True
    return ch


@pytest.mark.asyncio
async def test_send_text_only():
    ch = _make_channel()
    msg = OutboundMessage(channel="whatsapp", chat_id="123@s.whatsapp.net", content="hello")

    await ch.send(msg)

    ch._ws.send.assert_called_once()
    payload = json.loads(ch._ws.send.call_args[0][0])
    assert payload["type"] == "send"
    assert payload["text"] == "hello"


@pytest.mark.asyncio
async def test_send_media_dispatches_send_media_command():
    ch = _make_channel()
    msg = OutboundMessage(
        channel="whatsapp",
        chat_id="123@s.whatsapp.net",
        content="check this out",
        media=["/tmp/photo.jpg"],
    )

    await ch.send(msg)

    assert ch._ws.send.call_count == 2
    text_payload = json.loads(ch._ws.send.call_args_list[0][0][0])
    media_payload = json.loads(ch._ws.send.call_args_list[1][0][0])

    assert text_payload["type"] == "send"
    assert text_payload["text"] == "check this out"

    assert media_payload["type"] == "send_media"
    assert media_payload["filePath"] == "/tmp/photo.jpg"
    assert media_payload["mimetype"] == "image/jpeg"
    assert media_payload["fileName"] == "photo.jpg"


@pytest.mark.asyncio
async def test_send_media_only_no_text():
    ch = _make_channel()
    msg = OutboundMessage(
        channel="whatsapp",
        chat_id="123@s.whatsapp.net",
        content="",
        media=["/tmp/doc.pdf"],
    )

    await ch.send(msg)

    ch._ws.send.assert_called_once()
    payload = json.loads(ch._ws.send.call_args[0][0])
    assert payload["type"] == "send_media"
    assert payload["mimetype"] == "application/pdf"


@pytest.mark.asyncio
async def test_send_multiple_media():
    ch = _make_channel()
    msg = OutboundMessage(
        channel="whatsapp",
        chat_id="123@s.whatsapp.net",
        content="",
        media=["/tmp/a.png", "/tmp/b.mp4"],
    )

    await ch.send(msg)

    assert ch._ws.send.call_count == 2
    p1 = json.loads(ch._ws.send.call_args_list[0][0][0])
    p2 = json.loads(ch._ws.send.call_args_list[1][0][0])
    assert p1["mimetype"] == "image/png"
    assert p2["mimetype"] == "video/mp4"


@pytest.mark.asyncio
async def test_send_when_disconnected_is_noop():
    ch = _make_channel()
    ch._connected = False

    msg = OutboundMessage(
        channel="whatsapp",
        chat_id="123@s.whatsapp.net",
        content="hello",
        media=["/tmp/x.jpg"],
    )
    await ch.send(msg)

    ch._ws.send.assert_not_called()


@pytest.mark.asyncio
async def test_group_policy_mention_skips_unmentioned_group_message():
    ch = WhatsAppChannel({"enabled": True, "groupPolicy": "mention"}, MagicMock())
    ch._handle_message = AsyncMock()

    await ch._handle_bridge_message(
        json.dumps(
            {
                "type": "message",
                "id": "m1",
                "sender": "12345@g.us",
                "pn": "user@s.whatsapp.net",
                "content": "hello group",
                "timestamp": 1,
                "isGroup": True,
                "wasMentioned": False,
            }
        )
    )

    ch._handle_message.assert_not_called()


@pytest.mark.asyncio
async def test_group_policy_mention_accepts_mentioned_group_message():
    ch = WhatsAppChannel({"enabled": True, "groupPolicy": "mention"}, MagicMock())
    ch._handle_message = AsyncMock()

    await ch._handle_bridge_message(
        json.dumps(
            {
                "type": "message",
                "id": "m1",
                "sender": "12345@g.us",
                "pn": "user@s.whatsapp.net",
                "content": "hello @bot",
                "timestamp": 1,
                "isGroup": True,
                "wasMentioned": True,
            }
        )
    )

    ch._handle_message.assert_awaited_once()
    kwargs = ch._handle_message.await_args.kwargs
    assert kwargs["chat_id"] == "12345@g.us"
    assert kwargs["sender_id"] == "user"


@pytest.mark.asyncio
async def test_sender_id_prefers_phone_jid_over_lid():
    """sender_id should resolve to phone number when @s.whatsapp.net JID is present."""
    ch = WhatsAppChannel({"enabled": True}, MagicMock())
    ch._handle_message = AsyncMock()

    await ch._handle_bridge_message(
        json.dumps({
            "type": "message",
            "id": "lid1",
            "sender": "ABC123@lid.whatsapp.net",
            "pn": "5551234@s.whatsapp.net",
            "content": "hi",
            "timestamp": 1,
        })
    )

    kwargs = ch._handle_message.await_args.kwargs
    assert kwargs["sender_id"] == "5551234"


@pytest.mark.asyncio
async def test_lid_to_phone_cache_resolves_lid_only_messages():
    """When only LID is present, a cached LID→phone mapping should be used."""
    ch = WhatsAppChannel({"enabled": True}, MagicMock())
    ch._handle_message = AsyncMock()

    # First message: both phone and LID → builds cache
    await ch._handle_bridge_message(
        json.dumps({
            "type": "message",
            "id": "c1",
            "sender": "LID99@lid.whatsapp.net",
            "pn": "5559999@s.whatsapp.net",
            "content": "first",
            "timestamp": 1,
        })
    )
    # Second message: only LID, no phone
    await ch._handle_bridge_message(
        json.dumps({
            "type": "message",
            "id": "c2",
            "sender": "LID99@lid.whatsapp.net",
            "pn": "",
            "content": "second",
            "timestamp": 2,
        })
    )

    second_kwargs = ch._handle_message.await_args_list[1].kwargs
    assert second_kwargs["sender_id"] == "5559999"


@pytest.mark.asyncio
async def test_voice_message_transcription_uses_media_path():
    """Voice messages are transcribed when media path is available."""
    ch = WhatsAppChannel({"enabled": True}, MagicMock())
    ch.transcription_provider = "openai"
    ch.transcription_api_key = "sk-test"
    ch._handle_message = AsyncMock()
    ch.transcribe_audio = AsyncMock(return_value="Hello world")

    await ch._handle_bridge_message(
        json.dumps({
            "type": "message",
            "id": "v1",
            "sender": "12345@s.whatsapp.net",
            "pn": "",
            "content": "[Voice Message]",
            "timestamp": 1,
            "media": ["/tmp/voice.ogg"],
        })
    )

    ch.transcribe_audio.assert_awaited_once_with("/tmp/voice.ogg")
    kwargs = ch._handle_message.await_args.kwargs
    assert kwargs["content"].startswith("Hello world")


@pytest.mark.asyncio
async def test_voice_message_no_media_shows_not_available():
    """Voice messages without media produce a fallback placeholder."""
    ch = WhatsAppChannel({"enabled": True}, MagicMock())
    ch._handle_message = AsyncMock()

    await ch._handle_bridge_message(
        json.dumps({
            "type": "message",
            "id": "v2",
            "sender": "12345@s.whatsapp.net",
            "pn": "",
            "content": "[Voice Message]",
            "timestamp": 1,
        })
    )

    kwargs = ch._handle_message.await_args.kwargs
    assert kwargs["content"] == "[Voice Message: Audio not available]"


@pytest.mark.asyncio
async def test_stream_delta_sends_initial_then_edits_with_ack_correlation():
    """First delta does a `send` and captures the key; subsequent deltas emit `edit`."""
    ch = _make_channel()

    captured_keys = [
        {"id": "MSG1", "remoteJid": "123@s.whatsapp.net", "fromMe": True},
    ]

    async def fake_send(raw: str) -> None:
        payload = json.loads(raw)
        req_id = payload.get("reqId")
        if not req_id:
            return
        # Simulate the bridge's ack loop: deliver a `sent` with the key for `send` commands,
        # and a bare `sent` ack for `edit` commands.
        ack: dict = {"type": "sent", "to": payload["to"], "reqId": req_id}
        if payload["type"] == "send":
            ack["key"] = captured_keys[0]
        await ch._handle_bridge_message(json.dumps(ack))

    ch._ws.send.side_effect = fake_send

    # Force immediate edits (no throttle) so the test doesn't need to sleep.
    ch.config.stream_edit_interval = 0.0

    chat = "123@s.whatsapp.net"
    stream_meta = {"_stream_id": "s1", "_stream_delta": True}

    await ch.send_delta(chat, "Hello", stream_meta)
    await ch.send_delta(chat, ", world", stream_meta)
    await ch.send_delta(chat, "!", {"_stream_id": "s1", "_stream_end": True})

    sent_payloads = [json.loads(c[0][0]) for c in ch._ws.send.call_args_list]
    op_types = [p["type"] for p in sent_payloads]
    assert op_types == ["send", "edit", "edit"]
    assert sent_payloads[0]["text"] == "Hello"
    assert sent_payloads[1]["text"] == "Hello, world"
    assert sent_payloads[1]["key"]["id"] == "MSG1"
    assert sent_payloads[2]["text"] == "Hello, world!"
    # Buffer should be cleaned up after stream_end
    assert chat not in ch._stream_bufs


@pytest.mark.asyncio
async def test_stream_delta_without_bridge_key_abandons_streaming():
    """If the bridge replies without a message key, the channel gives up cleanly."""
    ch = _make_channel()

    async def fake_send(raw: str) -> None:
        payload = json.loads(raw)
        ack = {"type": "sent", "to": payload["to"], "reqId": payload.get("reqId")}
        await ch._handle_bridge_message(json.dumps(ack))

    ch._ws.send.side_effect = fake_send
    ch.config.stream_edit_interval = 0.0

    chat = "123@s.whatsapp.net"
    await ch.send_delta(chat, "Hello", {"_stream_id": "s1"})
    # Second call should short-circuit (no key was captured), so still only 1 ws.send.
    await ch.send_delta(chat, " world", {"_stream_id": "s1"})
    assert ch._ws.send.call_count == 1


def test_load_or_create_bridge_token_persists_generated_secret(tmp_path):
    token_path = tmp_path / "whatsapp-auth" / "bridge-token"

    first = _load_or_create_bridge_token(token_path)
    second = _load_or_create_bridge_token(token_path)

    assert first == second
    assert token_path.read_text(encoding="utf-8") == first
    assert len(first) >= 32
    if os.name != "nt":
        assert token_path.stat().st_mode & 0o777 == 0o600


def test_configured_bridge_token_skips_local_token_file(monkeypatch, tmp_path):
    token_path = tmp_path / "whatsapp-auth" / "bridge-token"
    monkeypatch.setattr("nanobot.channels.whatsapp._bridge_token_path", lambda: token_path)
    ch = WhatsAppChannel({"enabled": True, "bridgeToken": "manual-secret"}, MagicMock())

    assert ch._effective_bridge_token() == "manual-secret"
    assert not token_path.exists()


@pytest.mark.asyncio
async def test_login_exports_effective_bridge_token(monkeypatch, tmp_path):
    token_path = tmp_path / "whatsapp-auth" / "bridge-token"
    bridge_dir = tmp_path / "bridge"
    bridge_dir.mkdir()
    calls = []

    monkeypatch.setattr("nanobot.channels.whatsapp._bridge_token_path", lambda: token_path)
    monkeypatch.setattr("nanobot.channels.whatsapp._ensure_bridge_setup", lambda: bridge_dir)
    monkeypatch.setattr("nanobot.channels.whatsapp.shutil.which", lambda _: "/usr/bin/npm")

    def fake_run(*args, **kwargs):
        calls.append((args, kwargs))
        return MagicMock()

    monkeypatch.setattr("nanobot.channels.whatsapp.subprocess.run", fake_run)
    ch = WhatsAppChannel({"enabled": True}, MagicMock())

    assert await ch.login() is True
    assert len(calls) == 1

    _, kwargs = calls[0]
    assert kwargs["cwd"] == bridge_dir
    assert kwargs["env"]["AUTH_DIR"] == str(token_path.parent)
    assert kwargs["env"]["BRIDGE_TOKEN"] == token_path.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_start_sends_auth_message_with_generated_token(monkeypatch, tmp_path):
    token_path = tmp_path / "whatsapp-auth" / "bridge-token"
    sent_messages: list[str] = []

    class FakeWS:
        def __init__(self) -> None:
            self.close = AsyncMock()

        async def send(self, message: str) -> None:
            sent_messages.append(message)
            ch._running = False

        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    class FakeConnect:
        def __init__(self, ws):
            self.ws = ws

        async def __aenter__(self):
            return self.ws

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr("nanobot.channels.whatsapp._bridge_token_path", lambda: token_path)
    monkeypatch.setitem(
        sys.modules,
        "websockets",
        types.SimpleNamespace(connect=lambda url: FakeConnect(FakeWS())),
    )

    ch = WhatsAppChannel({"enabled": True, "bridgeUrl": "ws://localhost:3001"}, MagicMock())
    await ch.start()

    assert sent_messages == [
        json.dumps({"type": "auth", "token": token_path.read_text(encoding="utf-8")})
    ]
