"""Session storage.

PocketBase is the source of truth when a client is configured. The JSONL
fallback exists only for local CLI use without a database. There is no
write-through copy: messages live in PB OR in JSONL, never both.

Design notes
------------
- Each in-memory message dict tracks `_pb_id` once it has been persisted.
  `save()` only inserts messages that don't yet have one, so we never
  delete-and-reinsert and a partial failure can never wipe history.
- One PocketBase `sessions` row per `key`. `get_or_create` enforces this
  on read: if duplicates exist (e.g. from earlier buggy code), the
  oldest is kept (preserves history) and the rest are deleted.
- No retries, no stubs, no fallbacks-to-jsonl on transient PB errors.
  If PB is unreachable the call propagates an exception — the caller
  decides what to do. Silent degradation is what got us into the mess.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from loguru import logger

from nanobot.config.paths import get_legacy_sessions_dir
from nanobot.utils.helpers import ensure_dir, find_legal_message_start, safe_filename


@dataclass
class Session:
    """A conversation session."""

    key: str  # channel:chat_id
    messages: list[dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)
    last_consolidated: int = 0
    _pb_session_id: str | None = field(default=None, repr=False)

    def add_message(self, role: str, content: str, **kwargs: Any) -> None:
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            **kwargs,
        }
        self.messages.append(msg)
        self.updated_at = datetime.now()

    def get_history(self, max_messages: int = 500) -> list[dict[str, Any]]:
        """Return unconsolidated messages aligned to a legal tool-call boundary."""
        unconsolidated = self.messages[self.last_consolidated:]
        sliced = unconsolidated[-max_messages:]

        for i, message in enumerate(sliced):
            if message.get("role") == "user":
                sliced = sliced[i:]
                break

        start = find_legal_message_start(sliced)
        if start:
            sliced = sliced[start:]

        out: list[dict[str, Any]] = []
        for message in sliced:
            entry: dict[str, Any] = {"role": message["role"], "content": message.get("content", "")}
            for key in ("tool_calls", "tool_call_id", "name", "reasoning_content"):
                if key in message:
                    entry[key] = message[key]
            out.append(entry)
        return out

    def clear(self) -> None:
        self.messages = []
        self.last_consolidated = 0
        self.updated_at = datetime.now()

    def retain_recent_legal_suffix(self, max_messages: int) -> None:
        if max_messages <= 0:
            self.clear()
            return
        if len(self.messages) <= max_messages:
            return

        start_idx = max(0, len(self.messages) - max_messages)
        while start_idx > 0 and self.messages[start_idx].get("role") != "user":
            start_idx -= 1

        retained = self.messages[start_idx:]
        start = find_legal_message_start(retained)
        if start:
            retained = retained[start:]

        dropped = len(self.messages) - len(retained)
        self.messages = retained
        self.last_consolidated = max(0, self.last_consolidated - dropped)
        self.updated_at = datetime.now()


_EXTRA_FIELDS = ("tool_calls", "tool_call_id", "name", "reasoning_content")


class SessionManager:
    """Sessions backed by PocketBase, with a JSONL fallback for no-PB setups."""

    def __init__(self, workspace: Path, pb_client: Any | None = None):
        self.workspace = workspace
        self.sessions_dir = ensure_dir(self.workspace / "sessions")
        self.legacy_sessions_dir = get_legacy_sessions_dir()
        self._cache: dict[str, Session] = {}
        self._pb = pb_client

    # ── Public API ───────────────────────────────────────────────────

    async def get_or_create(self, key: str) -> Session:
        if key in self._cache:
            return self._cache[key]

        session = await self._load(key) if self._pb else self._load_jsonl(key)

        if session is None:
            session = Session(key=key)
            if self._pb:
                await self._pb_create_session(session)

        self._cache[key] = session
        return session

    async def save(self, session: Session) -> None:
        if self._pb:
            await self._pb_save(session)
        else:
            self._save_jsonl(session)
        self._cache[session.key] = session

    async def list_sessions(self) -> list[dict[str, Any]]:
        if self._pb:
            return await self._pb_list_sessions()
        return self._list_sessions_jsonl()

    def invalidate(self, key: str) -> None:
        self._cache.pop(key, None)

    # ── PocketBase backend ───────────────────────────────────────────

    async def _load(self, key: str) -> Session | None:
        """Load (and dedup) a session from PB. Raises on PB connection errors."""
        result = await self._pb.query_records(
            "sessions", filter_expr=f"key = '{key}'", per_page=50,
        )
        items = result.get("items", [])
        if not items:
            return None

        # Enforce 1-row-per-key. Keep the OLDEST (preserves history) and
        # delete the rest. This handles dup rows left over from earlier
        # buggy code; in normal operation len(items) == 1.
        if len(items) > 1:
            items.sort(key=lambda r: r.get("created", ""))
            for dup in items[1:]:
                try:
                    await self._pb.delete_record("sessions", dup["id"])
                    logger.warning("PB: deleted dup session row {} for key={}", dup["id"], key)
                except Exception:
                    logger.exception("PB: failed to delete dup session {}", dup["id"])

        record = items[0]
        pb_session_id = record["id"]
        messages = await self._pb_load_messages(pb_session_id)

        metadata: dict[str, Any] = {}
        if record.get("metadata"):
            try:
                raw = record["metadata"]
                metadata = json.loads(raw) if isinstance(raw, str) else raw
            except (json.JSONDecodeError, TypeError):
                pass

        return Session(
            key=key,
            messages=messages,
            created_at=_parse_iso(record.get("created")),
            updated_at=_parse_iso(record.get("updated")),
            metadata=metadata,
            last_consolidated=int(record.get("last_consolidated") or 0),
            _pb_session_id=pb_session_id,
        )

    async def _pb_load_messages(self, pb_session_id: str) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        page = 1
        while True:
            result = await self._pb.query_records(
                "messages",
                filter_expr=f"session.id = '{pb_session_id}'",
                sort="position,timestamp",
                page=page,
                per_page=100,
            )
            batch = result.get("items", [])
            for m in batch:
                msg: dict[str, Any] = {
                    "role": m.get("role", ""),
                    "content": m.get("content", ""),
                    "_pb_id": m.get("id"),
                }
                if m.get("extra"):
                    try:
                        msg.update(json.loads(m["extra"]))
                    except (json.JSONDecodeError, TypeError):
                        pass
                if m.get("timestamp"):
                    msg["timestamp"] = m["timestamp"]
                messages.append(msg)
            if len(batch) < 100:
                break
            page += 1
        return messages

    async def _pb_create_session(self, session: Session) -> None:
        result = await self._pb.insert_record("sessions", {
            "key": session.key,
            "last_consolidated": session.last_consolidated,
            "metadata": json.dumps(session.metadata) if session.metadata else "",
        })
        session._pb_session_id = result.get("id")

    async def _pb_save(self, session: Session) -> None:
        """Append-only save: insert messages without `_pb_id`, then upsert
        the session record. Never deletes or rewrites existing messages."""

        if not session._pb_session_id:
            # Caller forgot to go through get_or_create (unusual). Try to
            # find an existing record by key, otherwise insert one.
            result = await self._pb.query_records(
                "sessions", filter_expr=f"key = '{session.key}'", per_page=1,
            )
            items = result.get("items", [])
            if items:
                session._pb_session_id = items[0]["id"]
            else:
                created = await self._pb.insert_record("sessions", {
                    "key": session.key,
                    "last_consolidated": session.last_consolidated,
                    "metadata": json.dumps(session.metadata) if session.metadata else "",
                })
                session._pb_session_id = created["id"]

        # Insert any new messages
        for i, msg in enumerate(session.messages):
            if msg.get("_pb_id"):
                continue
            extras = {k: msg[k] for k in _EXTRA_FIELDS if k in msg}
            try:
                result = await self._pb.insert_record("messages", {
                    "session": session._pb_session_id,
                    "role": msg.get("role", ""),
                    "content": msg.get("content", ""),
                    "timestamp": msg.get("timestamp", ""),
                    "position": i,
                    "extra": json.dumps(extras) if extras else "",
                })
                msg["_pb_id"] = result.get("id")
            except Exception:
                logger.exception(
                    "PB: insert message {} (role={}) failed for session {}",
                    i, msg.get("role"), session._pb_session_id,
                )

        # Update session metadata
        try:
            await self._pb.update_record("sessions", session._pb_session_id, {
                "key": session.key,
                "last_consolidated": session.last_consolidated,
                "metadata": json.dumps(session.metadata) if session.metadata else "",
            })
        except Exception:
            logger.exception("PB: update session row {} failed", session._pb_session_id)

    async def _pb_list_sessions(self) -> list[dict[str, Any]]:
        result = await self._pb.query_records("sessions", per_page=100)
        return [
            {
                "key": item.get("key", ""),
                "id": item.get("id", ""),
                "created_at": item.get("created", ""),
                "updated_at": item.get("updated", ""),
            }
            for item in result.get("items", [])
        ]

    # ── JSONL fallback (no-PB local mode) ────────────────────────────

    def _get_session_path(self, key: str) -> Path:
        safe_key = safe_filename(key.replace(":", "_"))
        return self.sessions_dir / f"{safe_key}.jsonl"

    def _get_legacy_session_path(self, key: str) -> Path:
        safe_key = safe_filename(key.replace(":", "_"))
        return self.legacy_sessions_dir / f"{safe_key}.jsonl"

    def _load_jsonl(self, key: str) -> Session | None:
        path = self._get_session_path(key)
        if not path.exists():
            legacy_path = self._get_legacy_session_path(key)
            if legacy_path.exists():
                try:
                    shutil.move(str(legacy_path), str(path))
                except Exception:
                    logger.exception("Failed to migrate session {}", key)

        if not path.exists():
            return None

        try:
            messages: list[dict[str, Any]] = []
            metadata: dict[str, Any] = {}
            created_at: datetime | None = None
            updated_at: datetime | None = None
            last_consolidated = 0

            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    data = json.loads(line)
                    if data.get("_type") == "metadata":
                        metadata = data.get("metadata", {})
                        created_at = _parse_iso(data.get("created_at"))
                        updated_at = _parse_iso(data.get("updated_at"))
                        last_consolidated = data.get("last_consolidated", 0)
                    else:
                        messages.append(data)

            return Session(
                key=key,
                messages=messages,
                created_at=created_at or datetime.now(),
                updated_at=updated_at or datetime.now(),
                metadata=metadata,
                last_consolidated=last_consolidated,
            )
        except Exception:
            logger.exception("Failed to load JSONL session {}", key)
            return None

    def _save_jsonl(self, session: Session) -> None:
        path = self._get_session_path(session.key)
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "_type": "metadata",
                "key": session.key,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
                "metadata": session.metadata,
                "last_consolidated": session.last_consolidated,
            }, ensure_ascii=False) + "\n")
            for msg in session.messages:
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    def _list_sessions_jsonl(self) -> list[dict[str, Any]]:
        sessions: list[dict[str, Any]] = []
        for path in self.sessions_dir.glob("*.jsonl"):
            try:
                with open(path, encoding="utf-8") as f:
                    first = f.readline().strip()
                    if first:
                        data = json.loads(first)
                        if data.get("_type") == "metadata":
                            sessions.append({
                                "key": data.get("key") or path.stem.replace("_", ":", 1),
                                "created_at": data.get("created_at"),
                                "updated_at": data.get("updated_at"),
                                "path": str(path),
                            })
            except Exception:
                continue
        return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)


# ── Helpers ──────────────────────────────────────────────────────────

def _parse_iso(value: Any) -> datetime:
    if not value:
        return datetime.now()
    try:
        if isinstance(value, datetime):
            return value
        s = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now()
