"""Tests for the claude_code tool: stream parsing, sync vs background delivery,
session resume/persistence, one-run-per-conversation, and stop."""

import asyncio
import json

import pytest

from nanobot.agent.tools.claude_code import ClaudeCodeTool
from nanobot.bus.events import OutboundMessage


def _enc(*objs) -> list[bytes]:
    return [(json.dumps(o) + "\n").encode() for o in objs]


class _FakeStdout:
    def __init__(self, chunks):
        self._chunks = list(chunks)

    async def readline(self):
        await asyncio.sleep(0)
        return self._chunks.pop(0) if self._chunks else b""


class _FakeStderr:
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _FakeProc:
    def __init__(self, chunks, returncode=0):
        self.stdout = _FakeStdout(chunks)
        self.stderr = _FakeStderr()
        self._rc = returncode
        self.returncode = None

    async def wait(self):
        self.returncode = self._rc
        return self._rc

    def terminate(self):
        self.returncode = self._rc

    def kill(self):
        self.returncode = self._rc


def _patch_spawn(monkeypatch, chunks, returncode=0, capture=None, raise_fnf=False):
    async def fake(*cmd, **kw):
        if capture is not None:
            capture["cmd"] = list(cmd)
            capture["cwd"] = kw.get("cwd")
            capture["env"] = kw.get("env")
        if raise_fnf:
            raise FileNotFoundError("claude")
        return _FakeProc(chunks, returncode)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake)


_INIT = {"type": "system", "subtype": "init", "session_id": "sess-1"}

def _result(text="done", session="sess-1", is_error=False, turns=2, cost=0.01):
    return {"type": "result", "subtype": "success", "result": text,
            "session_id": session, "is_error": is_error, "num_turns": turns,
            "total_cost_usd": cost}

def _tool_use(name="Edit", path="src/a.py"):
    return {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": name, "input": {"file_path": path}}]}}


@pytest.mark.asyncio
async def test_sync_channel_returns_result(tmp_path, monkeypatch):
    cap = {}
    _patch_spawn(monkeypatch, _enc(_INIT, _tool_use(), _result(text="all green")), capture=cap)
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=None, progress_interval=0)
    tool.set_context("cli", "direct")

    out = await tool.execute(action="run", task="fix it")
    assert "all green" in out
    assert "Claude Code" in out and "✅" in out
    # command shape
    assert cap["cmd"][:2] == ["claude", "-p"]
    assert "fix it" in cap["cmd"]
    assert "stream-json" in cap["cmd"] and "--permission-mode" in cap["cmd"]
    # session persisted for resume
    assert tool._claude_session["cli:direct"] == "sess-1"
    assert (tmp_path / "sessions.json").exists()


@pytest.mark.asyncio
async def test_second_run_resumes_session(tmp_path, monkeypatch):
    _patch_spawn(monkeypatch, _enc(_INIT, _result()))
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=None, progress_interval=0)
    tool.set_context("cli", "direct")
    await tool.execute(action="run", task="first")

    cap = {}
    _patch_spawn(monkeypatch, _enc(_INIT, _result()), capture=cap)
    await tool.execute(action="run", task="second")
    assert "--resume" in cap["cmd"]
    assert "sess-1" in cap["cmd"]


@pytest.mark.asyncio
async def test_new_session_does_not_resume(tmp_path, monkeypatch):
    _patch_spawn(monkeypatch, _enc(_INIT, _result()))
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=None, progress_interval=0)
    tool.set_context("cli", "direct")
    await tool.execute(action="run", task="first")

    cap = {}
    _patch_spawn(monkeypatch, _enc(_INIT, _result()), capture=cap)
    await tool.execute(action="run", task="unrelated", new_session=True)
    assert "--resume" not in cap["cmd"]


@pytest.mark.asyncio
async def test_background_channel_pushes_result(tmp_path, monkeypatch):
    pushed: list[OutboundMessage] = []

    async def send(m):
        pushed.append(m)

    _patch_spawn(monkeypatch, _enc(_INIT, _tool_use(), _result(text="shipped")))
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=send, progress_interval=0)
    tool.set_context("whatsapp", "33600@lid")

    out = await tool.execute(action="run", task="build a thing")
    assert "Started Claude Code" in out  # immediate, non-blocking
    job = tool._active.get("whatsapp:33600@lid")
    assert job is not None and job.task is not None
    await job.task  # let the background job finish

    contents = "\n".join(m.content for m in pushed)
    assert "shipped" in contents
    assert all(m.channel == "whatsapp" and m.chat_id == "33600@lid" for m in pushed)


@pytest.mark.asyncio
async def test_one_run_per_conversation(tmp_path, monkeypatch):
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow(*cmd, **kw):
        started.set()
        await release.wait()
        return _FakeProc(_enc(_INIT, _result()))

    monkeypatch.setattr(asyncio, "create_subprocess_exec", slow)

    async def send(m):
        pass

    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=send, progress_interval=0)
    tool.set_context("whatsapp", "u1")
    first = await tool.execute(action="run", task="one")
    assert "Started" in first
    await started.wait()

    busy = await tool.execute(action="run", task="two")
    assert "already running" in busy.lower()

    release.set()
    await tool._active["whatsapp:u1"].task


@pytest.mark.asyncio
async def test_status_and_stop(tmp_path, monkeypatch):
    release = asyncio.Event()

    async def slow(*cmd, **kw):
        await release.wait()
        return _FakeProc(_enc(_INIT, _result()))

    monkeypatch.setattr(asyncio, "create_subprocess_exec", slow)

    async def send(m):
        pass

    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=send)
    tool.set_context("whatsapp", "u2")
    await tool.execute(action="run", task="go")
    assert "running" in (await tool.execute(action="status")).lower()

    stopped = await tool.execute(action="stop")
    assert "stop" in stopped.lower()
    release.set()
    await asyncio.sleep(0)
    assert "no claude code task" in (await tool.execute(action="status")).lower()


@pytest.mark.asyncio
async def test_binary_not_found(tmp_path, monkeypatch):
    _patch_spawn(monkeypatch, [], raise_fnf=True)
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=None)
    tool.set_context("cli", "direct")
    out = await tool.execute(action="run", task="x")
    assert "not found" in out.lower()


@pytest.mark.asyncio
async def test_no_result_event_fails_loud(tmp_path, monkeypatch):
    # Clean exit (rc=0) but the stream never emitted a terminal 'result' event.
    _patch_spawn(monkeypatch, _enc(_INIT, _tool_use()), returncode=0)
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=None, progress_interval=0)
    tool.set_context("cli", "direct")
    out = await tool.execute(action="run", task="x")
    assert "⚠️" in out
    assert "without a result" in out.lower()


@pytest.mark.asyncio
async def test_restrict_to_workspace_scopes_dir(tmp_path, monkeypatch):
    cap = {}
    _patch_spawn(monkeypatch, _enc(_INIT, _result()), capture=cap)
    tool = ClaudeCodeTool(
        workspace_root=tmp_path, send_callback=None, progress_interval=0,
        restrict_to_workspace=True,
    )
    tool.set_context("cli", "direct")
    await tool.execute(action="run", task="x")
    assert "--add-dir" in cap["cmd"]


@pytest.mark.asyncio
async def test_context_is_captured_per_call(tmp_path, monkeypatch):
    """set_context for different conversations must route to the right workdir/key."""
    _patch_spawn(monkeypatch, _enc(_INIT, _result(session="s-a")))
    tool = ClaudeCodeTool(workspace_root=tmp_path, send_callback=None, progress_interval=0)

    tool.set_context("cli", "alice")
    await tool.execute(action="run", task="a")
    _patch_spawn(monkeypatch, _enc(_INIT, _result(session="s-b")))
    tool.set_context("cli", "bob")
    await tool.execute(action="run", task="b")

    assert tool._claude_session["cli:alice"] == "s-a"
    assert tool._claude_session["cli:bob"] == "s-b"
