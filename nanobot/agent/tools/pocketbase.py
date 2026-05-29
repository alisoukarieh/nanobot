"""PocketBase REST API client for the db tool."""

import asyncio
import random
from typing import Any

import httpx
from loguru import logger


class PocketBaseError(Exception):
    """Error from PocketBase API."""

    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


# Server-side statuses worth retrying: the request was rejected at/around the
# edge (overload, restart, gateway) rather than by application validation.
_RETRY_STATUSES = {429, 502, 503, 504}
# Connection-phase failures: the request almost certainly never reached the
# application, so they are safe to retry even for non-idempotent POSTs.
_CONNECT_EXC = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)
# Mid-flight transport failures: safe to retry only for idempotent methods,
# because a POST insert may have been applied server-side before the failure.
_READ_EXC = (httpx.ReadTimeout, httpx.WriteTimeout, httpx.RemoteProtocolError)


class PocketBaseClient:
    """Async client for PocketBase REST API (v0.22+).

    Resilience: a single pooled ``httpx.AsyncClient`` (keep-alive), granular
    timeouts, and bounded retry-with-backoff on *transient* failures only.
    Permanent application errors (4xx validation) raise immediately, and after
    exhausting retries a transient failure still raises — never silently
    degrades. This keeps the "no silent fallback" session-storage contract:
    callers see real failures, they just don't see a single PB hiccup.
    """

    _AUTH_PATH = "/api/collections/_superusers/auth-with-password"
    _COLLECTIONS_PATH = "/api/collections"
    _MAX_ATTEMPTS = 4

    def __init__(self, base_url: str, admin_email: str, admin_password: str):
        self._base_url = base_url.rstrip("/")
        self._email = admin_email
        self._password = admin_password
        self._token: str | None = None
        self._auth_lock = asyncio.Lock()
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
            # Transport-level retries cover only connection establishment; our
            # own loop below handles status/read retries with backoff.
            transport=httpx.AsyncHTTPTransport(retries=2),
        )

    async def aclose(self) -> None:
        """Close the shared connection pool. Call on shutdown."""
        await self._client.aclose()

    async def _backoff(self, attempt: int, retry_after: str | None = None) -> None:
        delay = min(8.0, 0.25 * (2 ** attempt)) + random.uniform(0.0, 0.25)
        if retry_after:
            try:
                delay = max(delay, float(retry_after))
            except (TypeError, ValueError):
                pass
        await asyncio.sleep(delay)

    async def _auth(self) -> str:
        """Authenticate as admin and cache the token (transient-retrying)."""
        async with self._auth_lock:
            last_exc: Exception | None = None
            for attempt in range(self._MAX_ATTEMPTS):
                try:
                    r = await self._client.post(
                        self._AUTH_PATH,
                        json={"identity": self._email, "password": self._password},
                    )
                except _CONNECT_EXC + _READ_EXC as e:  # auth is idempotent
                    last_exc = e
                else:
                    if r.status_code in _RETRY_STATUSES and attempt < self._MAX_ATTEMPTS - 1:
                        await self._backoff(attempt, r.headers.get("Retry-After"))
                        continue
                    if r.status_code != 200:
                        raise PocketBaseError(
                            f"Authentication failed: {_extract_error(r)}", r.status_code
                        )
                    self._token = r.json().get("token", "")
                    return self._token
                if attempt < self._MAX_ATTEMPTS - 1:
                    await self._backoff(attempt)
            raise PocketBaseError(
                f"Authentication failed after {self._MAX_ATTEMPTS} attempts: "
                f"{type(last_exc).__name__ if last_exc else 'unknown'}",
                0,
            )

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make an authenticated request.

        Retries transient failures (connection errors always; read/transport
        errors only for idempotent methods; 429/502/503/504) with jittered
        backoff, re-auths once on 401, and raises on permanent errors or after
        exhausting attempts.
        """
        if not self._token:
            await self._auth()

        method_u = method.upper()
        # POST creates a record and is NOT idempotent: a read timeout could
        # mean the insert was applied. Don't retry POST on read/transport
        # errors — only on connection-phase failures (never reached the app).
        retry_read = method_u != "POST"

        reauthed = False
        last_exc: Exception | None = None
        last_status: int | None = None
        for attempt in range(self._MAX_ATTEMPTS):
            retry_after: str | None = None
            transient = False
            try:
                headers = {"Authorization": f"Bearer {self._token}"}
                r = await self._client.request(
                    method, path, json=json, params=params, headers=headers
                )
            except _CONNECT_EXC as e:
                last_exc, transient = e, True
            except _READ_EXC as e:
                if not retry_read:
                    raise PocketBaseError(
                        f"PocketBase {method} {path} failed: {type(e).__name__}", 0
                    ) from e
                last_exc, transient = e, True
            else:
                if r.status_code == 401 and not reauthed:
                    reauthed = True
                    logger.debug("PocketBase token expired, re-authenticating")
                    self._token = None
                    await self._auth()
                    continue
                if r.status_code in _RETRY_STATUSES:
                    transient, last_status, retry_after = True, r.status_code, r.headers.get("Retry-After")
                elif r.status_code >= 400:
                    raise PocketBaseError(
                        f"PocketBase {method} {path} failed ({r.status_code}): {_extract_error(r)}",
                        r.status_code,
                    )
                else:
                    return r.json() if r.content else {}

            if transient and attempt < self._MAX_ATTEMPTS - 1:
                await self._backoff(attempt, retry_after)
                continue
            break

        detail = f"{type(last_exc).__name__}" if last_exc else f"HTTP {last_status}"
        raise PocketBaseError(
            f"PocketBase {method} {path} failed after {self._MAX_ATTEMPTS} attempts: {detail}",
            last_status or 0,
        )

    # ── Collection operations ────────────────────────────────────────

    async def create_collection(self, name: str, fields: list[dict[str, Any]]) -> dict[str, Any]:
        """Create a new collection accessible to any authenticated user.

        PocketBase defaults new collections to superuser-only (rules=null),
        which breaks every skill-backed UI because dashboard users aren't
        superusers. Every new collection gets `@request.auth.id != ""` on
        all five rules so any logged-in `users` record can CRUD. If a
        caller needs tighter rules, they can PATCH the collection after.
        """
        auth_rule = '@request.auth.id != ""'
        return await self._request(
            "POST",
            self._COLLECTIONS_PATH,
            json={
                "name": name,
                "type": "base",
                "fields": fields,
                "listRule": auth_rule,
                "viewRule": auth_rule,
                "createRule": auth_rule,
                "updateRule": auth_rule,
                "deleteRule": auth_rule,
            },
        )

    async def list_collections(self) -> list[dict[str, Any]]:
        """List all collections."""
        data = await self._request("GET", self._COLLECTIONS_PATH)
        return data.get("items", data) if isinstance(data, dict) else data

    # ── Record operations ────────────────────────────────────────────

    async def insert_record(self, collection: str, data: dict[str, Any]) -> dict[str, Any]:
        """Insert a record into a collection."""
        return await self._request(
            "POST",
            f"{self._COLLECTIONS_PATH}/{collection}/records",
            json=data,
        )

    async def query_records(
        self,
        collection: str,
        filter_expr: str = "",
        sort: str = "",
        page: int = 1,
        per_page: int = 20,
    ) -> dict[str, Any]:
        """Query records from a collection."""
        params: dict[str, Any] = {"page": page, "perPage": per_page}
        if filter_expr:
            params["filter"] = filter_expr
        if sort:
            params["sort"] = sort
        return await self._request(
            "GET",
            f"{self._COLLECTIONS_PATH}/{collection}/records",
            params=params,
        )

    async def update_record(
        self, collection: str, record_id: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """Update a record by ID."""
        return await self._request(
            "PATCH",
            f"{self._COLLECTIONS_PATH}/{collection}/records/{record_id}",
            json=data,
        )

    async def delete_record(self, collection: str, record_id: str) -> dict[str, Any]:
        """Delete a record by ID."""
        return await self._request(
            "DELETE",
            f"{self._COLLECTIONS_PATH}/{collection}/records/{record_id}",
        )


def _extract_error(response: httpx.Response) -> str:
    """Extract a human-readable error from a PocketBase response.

    PocketBase wraps per-field validation reasons under `data`, e.g.
        {"message": "Failed to create record.", "data":
            {"title": {"code": "validation_required", "message": "Cannot be blank."}}}
    Returning only `message` strips the actionable detail and leaves the
    caller (often an LLM) guessing why the request failed. Surface the
    field-level reasons too so the caller can self-correct.
    """
    try:
        body = response.json()
        if isinstance(body, dict):
            message = body.get("message", "") or ""
            data = body.get("data")
            if isinstance(data, dict) and data:
                fields = ", ".join(
                    f"{k}: {v.get('message', v) if isinstance(v, dict) else v}"
                    for k, v in data.items()
                )
                return f"{message} — {fields}" if message else fields
            return message or str(body)
    except Exception:
        pass
    return response.text[:200] if response.text else f"HTTP {response.status_code}"
