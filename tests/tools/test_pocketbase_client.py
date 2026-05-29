"""Resilience tests for PocketBaseClient: transient retry, POST idempotency,
permanent-error passthrough."""

import httpx
import pytest

from nanobot.agent.tools.pocketbase import PocketBaseClient, PocketBaseError


def _client(handler) -> PocketBaseClient:
    c = PocketBaseClient("http://pb.test", "admin@test", "pw")
    c._token = "tok"  # skip the auth round-trip
    c._client = httpx.AsyncClient(base_url="http://pb.test", transport=httpx.MockTransport(handler))
    return c


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    async def _instant(self, attempt, retry_after=None):
        return None
    monkeypatch.setattr(PocketBaseClient, "_backoff", _instant)


@pytest.mark.asyncio
async def test_get_retries_transient_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(200, json={"items": [], "totalItems": 0})

    c = _client(handler)
    result = await c.query_records("messages")
    assert result == {"items": [], "totalItems": 0}
    assert calls["n"] == 3  # two failures then success


@pytest.mark.asyncio
async def test_retries_exhausted_raises() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("nope", request=request)

    c = _client(handler)
    with pytest.raises(PocketBaseError):
        await c.query_records("messages")


@pytest.mark.asyncio
async def test_post_not_retried_on_read_timeout() -> None:
    """A read timeout on a POST might mean the insert was applied — must NOT
    retry, to protect the append-only contract."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        raise httpx.ReadTimeout("slow", request=request)

    c = _client(handler)
    with pytest.raises(PocketBaseError):
        await c.insert_record("messages", {"x": 1})
    assert calls["n"] == 1  # exactly one attempt, no retry


@pytest.mark.asyncio
async def test_post_retried_on_connect_error() -> None:
    """Connect-phase failures never reached the app, so POST may retry."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            raise httpx.ConnectError("refused", request=request)
        return httpx.Response(200, json={"id": "abc"})

    c = _client(handler)
    result = await c.insert_record("messages", {"x": 1})
    assert result == {"id": "abc"}
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_permanent_400_raises_immediately_with_detail() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(
            400,
            json={"message": "Failed to create record.",
                  "data": {"content": {"message": "Must be no more than 5000 character(s)."}}},
        )

    c = _client(handler)
    with pytest.raises(PocketBaseError) as ei:
        await c.insert_record("messages", {"content": "x"})
    assert ei.value.status == 400
    assert "5000" in str(ei.value)
    assert calls["n"] == 1  # validation errors are not retried


@pytest.mark.asyncio
async def test_503_is_retried() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 2:
            return httpx.Response(503, text="unavailable")
        return httpx.Response(200, json={"ok": True})

    c = _client(handler)
    assert await c.query_records("messages") == {"ok": True}
    assert calls["n"] == 2
