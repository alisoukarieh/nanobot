"""Tests for the PocketBase database tool."""

import json

import httpx
import pytest

from nanobot.agent.tools.db import DbTool
from nanobot.agent.tools.pocketbase import PocketBaseClient, PocketBaseError


def _client() -> PocketBaseClient:
    return PocketBaseClient("http://localhost:8090", "admin@test.com", "testpass")


def _tool() -> DbTool:
    return DbTool(_client())


def _response(status: int = 200, json_data: dict | list | None = None) -> httpx.Response:
    r = httpx.Response(status, json=json_data)
    r._request = httpx.Request("POST", "https://mock")
    return r


# ── Auth ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_auth_caches_token(monkeypatch):
    """Auth token should be cached after first request."""
    auth_calls = []

    async def mock_request(self, method, url, **kw):
        if "_superusers/auth-with-password" in url:
            auth_calls.append(1)
            return _response(json_data={"token": "tok123"})
        return _response(json_data={"items": []})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    client = _client()
    await client.list_collections()
    await client.list_collections()
    # Auth called once, second request reuses cached token
    assert len(auth_calls) == 1


@pytest.mark.asyncio
async def test_auth_retries_on_401(monkeypatch):
    """On 401, token should be cleared and re-authed."""
    call_count = {"auth": 0, "request": 0}

    async def mock_request(self, method, url, **kw):
        if "_superusers/auth-with-password" in url:
            call_count["auth"] += 1
            return _response(json_data={"token": f"tok{call_count['auth']}"})
        call_count["request"] += 1
        if call_count["request"] == 1:
            return _response(status=401, json_data={"message": "expired"})
        return _response(json_data={"items": []})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    client = _client()
    result = await client.list_collections()
    assert call_count["auth"] == 2  # initial + retry
    assert call_count["request"] == 2


@pytest.mark.asyncio
async def test_auth_failure_raises(monkeypatch):
    async def mock_request(self, method, url, **kw):
        return _response(status=403, json_data={"message": "invalid credentials"})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    client = _client()
    with pytest.raises(PocketBaseError, match="Authentication failed"):
        await client.list_collections()


# ── create_collection ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_collection_success(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        assert method == "POST"
        assert "/api/collections" in url
        body = kw.get("json", {})
        assert body["name"] == "calorie_logs"
        assert body["type"] == "base"
        assert len(body["fields"]) == 2
        return _response(json_data={
            "id": "col123",
            "name": "calorie_logs",
            "fields": body["fields"],
        })

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    schema = json.dumps([
        {"name": "meal", "type": "text", "required": True},
        {"name": "calories", "type": "number", "required": True},
    ])
    result = await tool.execute(action="create_collection", collection="calorie_logs", schema=schema)
    assert "Created collection 'calorie_logs'" in result
    assert "2 fields" in result


@pytest.mark.asyncio
async def test_create_collection_missing_name():
    tool = _tool()
    result = await tool.execute(action="create_collection", schema="[]")
    assert "Error" in result
    assert "collection" in result.lower()


@pytest.mark.asyncio
async def test_create_collection_missing_schema():
    tool = _tool()
    result = await tool.execute(action="create_collection", collection="test")
    assert "Error" in result
    assert "schema" in result.lower()


@pytest.mark.asyncio
async def test_create_collection_invalid_json():
    tool = _tool()
    result = await tool.execute(
        action="create_collection", collection="test", schema="not json"
    )
    assert "Error" in result
    assert "JSON" in result


# ── list_collections ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_collections(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        return _response(json_data={"items": [
            {"name": "calorie_logs", "type": "base", "fields": [
                {"name": "meal", "type": "text"},
                {"name": "calories", "type": "number"},
            ]},
            {"name": "habits", "type": "base", "fields": []},
        ]})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    result = await tool.execute(action="list_collections")
    assert "calorie_logs" in result
    assert "meal" in result
    assert "habits" in result


@pytest.mark.asyncio
async def test_list_collections_empty(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        return _response(json_data={"items": []})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    result = await tool.execute(action="list_collections")
    assert "No collections" in result


# ── insert ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_insert_success(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        assert method == "POST"
        assert "/calorie_logs/records" in url
        body = kw.get("json", {})
        assert body["meal"] == "chicken"
        assert body["calories"] == 450
        return _response(json_data={"id": "rec123", "meal": "chicken", "calories": 450})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    data = json.dumps({"meal": "chicken", "calories": 450})
    result = await tool.execute(action="insert", collection="calorie_logs", data=data)
    assert "Inserted record" in result
    assert "rec123" in result


@pytest.mark.asyncio
async def test_insert_missing_collection():
    tool = _tool()
    result = await tool.execute(action="insert", data='{"a": 1}')
    assert "Error" in result


@pytest.mark.asyncio
async def test_insert_missing_data():
    tool = _tool()
    result = await tool.execute(action="insert", collection="test")
    assert "Error" in result


# ── query ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_query_with_filter(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        assert method == "GET"
        params = kw.get("params", {})
        assert params["filter"] == "calories > 400"
        assert params["sort"] == "-created"
        return _response(json_data={
            "items": [
                {"id": "r1", "meal": "chicken", "calories": 450, "created": "2026-04-12"},
            ],
            "totalItems": 1,
        })

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    result = await tool.execute(
        action="query", collection="calorie_logs",
        filter="calories > 400", sort="-created",
    )
    assert "1 record" in result
    assert "chicken" in result


@pytest.mark.asyncio
async def test_query_no_results(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        return _response(json_data={"items": [], "totalItems": 0})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    result = await tool.execute(action="query", collection="calorie_logs")
    assert "No records" in result


# ── update ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_success(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        assert method == "PATCH"
        assert "/records/rec123" in url
        return _response(json_data={"id": "rec123", "calories": 500})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    data = json.dumps({"calories": 500})
    result = await tool.execute(
        action="update", collection="calorie_logs", record_id="rec123", data=data
    )
    assert "Updated record 'rec123'" in result


@pytest.mark.asyncio
async def test_update_missing_record_id():
    tool = _tool()
    result = await tool.execute(action="update", collection="test", data='{"a": 1}')
    assert "Error" in result
    assert "record_id" in result


# ── delete ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_success(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        assert method == "DELETE"
        assert "/records/rec123" in url
        return _response(status=204, json_data=None)

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    result = await tool.execute(
        action="delete", collection="calorie_logs", record_id="rec123"
    )
    assert "Deleted record 'rec123'" in result


@pytest.mark.asyncio
async def test_delete_missing_record_id():
    tool = _tool()
    result = await tool.execute(action="delete", collection="test")
    assert "Error" in result


# ── error handling ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unknown_action():
    tool = _tool()
    result = await tool.execute(action="drop_table")
    assert "Error" in result
    assert "Unknown action" in result


@pytest.mark.asyncio
async def test_pocketbase_error_forwarded(monkeypatch):
    async def mock_request(self, method, url, **kw):
        if "_superusers" in url:
            return _response(json_data={"token": "tok"})
        return _response(status=400, json_data={"message": "collection already exists"})

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    schema = json.dumps([{"name": "x", "type": "text"}])
    result = await tool.execute(
        action="create_collection", collection="dupe", schema=schema
    )
    assert "Error" in result
    assert "already exists" in result


@pytest.mark.asyncio
async def test_connection_error(monkeypatch):
    async def mock_request(self, method, url, **kw):
        raise httpx.ConnectError("Connection refused")

    monkeypatch.setattr(httpx.AsyncClient, "request", mock_request)
    tool = _tool()
    result = await tool.execute(action="list_collections")
    assert "Error" in result
