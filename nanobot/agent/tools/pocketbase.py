"""PocketBase REST API client for the db tool."""

from typing import Any

import httpx
from loguru import logger


class PocketBaseError(Exception):
    """Error from PocketBase API."""

    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class PocketBaseClient:
    """Async client for PocketBase REST API (v0.22+)."""

    _AUTH_PATH = "/api/collections/_superusers/auth-with-password"
    _COLLECTIONS_PATH = "/api/collections"
    _TIMEOUT = 10.0

    def __init__(self, base_url: str, admin_email: str, admin_password: str):
        self._base_url = base_url.rstrip("/")
        self._email = admin_email
        self._password = admin_password
        self._token: str | None = None

    async def _auth(self) -> str:
        """Authenticate as admin and cache the token."""
        async with httpx.AsyncClient(timeout=self._TIMEOUT) as client:
            r = await client.post(
                f"{self._base_url}{self._AUTH_PATH}",
                json={"identity": self._email, "password": self._password},
            )
        if r.status_code != 200:
            detail = _extract_error(r)
            raise PocketBaseError(f"Authentication failed: {detail}", r.status_code)
        self._token = r.json().get("token", "")
        return self._token

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make an authenticated request with auto-retry on 401."""
        if not self._token:
            await self._auth()

        for attempt in range(2):
            headers = {"Authorization": f"Bearer {self._token}"}
            async with httpx.AsyncClient(timeout=self._TIMEOUT) as client:
                r = await client.request(
                    method,
                    f"{self._base_url}{path}",
                    json=json,
                    params=params,
                    headers=headers,
                )
            if r.status_code == 401 and attempt == 0:
                logger.debug("PocketBase token expired, re-authenticating")
                self._token = None
                await self._auth()
                continue
            if r.status_code >= 400:
                detail = _extract_error(r)
                raise PocketBaseError(
                    f"PocketBase {method} {path} failed ({r.status_code}): {detail}",
                    r.status_code,
                )
            return r.json() if r.content else {}
        return {}  # unreachable, satisfies type checker

    # ── Collection operations ────────────────────────────────────────

    async def create_collection(self, name: str, fields: list[dict[str, Any]]) -> dict[str, Any]:
        """Create a new collection with the given field definitions."""
        return await self._request(
            "POST",
            self._COLLECTIONS_PATH,
            json={"name": name, "type": "base", "fields": fields},
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
    """Extract a human-readable error from a PocketBase response."""
    try:
        body = response.json()
        if isinstance(body, dict):
            return body.get("message", "") or str(body)
    except Exception:
        pass
    return response.text[:200] if response.text else f"HTTP {response.status_code}"
