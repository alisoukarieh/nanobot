"""Session management for conversation history."""

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
    last_consolidated: int = 0  # Number of messages already consolidated to files
    _pb_session_id: str | None = field(default=None, repr=False)  # PocketBase record ID

    def add_message(self, role: str, content: str, **kwargs: Any) -> None:
        """Add a message to the session."""
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            **kwargs
        }
        self.messages.append(msg)
        self.updated_at = datetime.now()

    def get_history(self, max_messages: int = 500) -> list[dict[str, Any]]:
        """Return unconsolidated messages for LLM input, aligned to a legal tool-call boundary."""
        unconsolidated = self.messages[self.last_consolidated:]
        sliced = unconsolidated[-max_messages:]

        # Avoid starting mid-turn when possible.
        for i, message in enumerate(sliced):
            if message.get("role") == "user":
                sliced = sliced[i:]
                break

        # Drop orphan tool results at the front.
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
        """Clear all messages and reset session to initial state."""
        self.messages = []
        self.last_consolidated = 0
        self.updated_at = datetime.now()

    def retain_recent_legal_suffix(self, max_messages: int) -> None:
        """Keep a legal recent suffix, mirroring get_history boundary rules."""
        if max_messages <= 0:
            self.clear()
            return
        if len(self.messages) <= max_messages:
            return

        start_idx = max(0, len(self.messages) - max_messages)

        # If the cutoff lands mid-turn, extend backward to the nearest user turn.
        while start_idx > 0 and self.messages[start_idx].get("role") != "user":
            start_idx -= 1

        retained = self.messages[start_idx:]

        # Mirror get_history(): avoid persisting orphan tool results at the front.
        start = find_legal_message_start(retained)
        if start:
            retained = retained[start:]

        dropped = len(self.messages) - len(retained)
        self.messages = retained
        self.last_consolidated = max(0, self.last_consolidated - dropped)
        self.updated_at = datetime.now()


class SessionManager:
    """
    Manages conversation sessions.

    Uses PocketBase when a client is provided, falls back to JSONL files.
    """

    def __init__(self, workspace: Path, pb_client: Any | None = None):
        self.workspace = workspace
        self.sessions_dir = ensure_dir(self.workspace / "sessions")
        self.legacy_sessions_dir = get_legacy_sessions_dir()
        self._cache: dict[str, Session] = {}
        self._pb = pb_client  # Optional PocketBaseClient

    # ── Public API (async) ────────────────────────────────────────────

    async def get_or_create(self, key: str) -> Session:
        """Get an existing session or create a new one."""
        if key in self._cache:
            return self._cache[key]

        session = await self._load(key)
        if session is None:
            session = Session(key=key)
            if self._pb:
                await self._pb_create_session(session)

        self._cache[key] = session
        return session

    async def save(self, session: Session) -> None:
        """Save a session."""
        if self._pb:
            await self._pb_save(session)
        else:
            self._save_jsonl(session)
        self._cache[session.key] = session

    async def list_sessions(self) -> list[dict[str, Any]]:
        """List all sessions."""
        if self._pb:
            return await self._pb_list_sessions()
        return self._list_sessions_jsonl()

    def invalidate(self, key: str) -> None:
        """Remove a session from the in-memory cache."""
        self._cache.pop(key, None)

    # ── Load dispatch ────────────────────────────────────────────────

    async def _load(self, key: str) -> Session | None:
        """Load a session from PocketBase or JSONL."""
        if self._pb:
            return await self._pb_load(key)
        return self._load_jsonl(key)

    # ── PocketBase backend ───────────────────────────────────────────

    async def _pb_create_session(self, session: Session) -> None:
        """Create a new session record in PocketBase."""
        try:
            result = await self._pb.insert_record("sessions", {
                "key": session.key,
                "last_consolidated": session.last_consolidated,
                "metadata": json.dumps(session.metadata),
            })
            session._pb_session_id = result.get("id")
        except Exception as e:
            logger.warning("PB: failed to create session {}: {}", session.key, e)

    async def _pb_load(self, key: str) -> Session | None:
        """Load a session and its messages from PocketBase."""
        try:
            result = await self._pb.query_records(
                "sessions", filter_expr=f'key = "{key}"', per_page=1,
            )
            items = result.get("items", [])
            if not items:
                return None

            record = items[0]
            pb_session_id = record["id"]

            # Load all messages for this session
            messages = []
            page = 1
            while True:
                msg_result = await self._pb.query_records(
                    "messages",
                    filter_expr=f'session = "{pb_session_id}"',
                    sort="created,position",
                    page=page,
                    per_page=100,
                )
                batch = msg_result.get("items", [])
                for m in batch:
                    msg: dict[str, Any] = {
                        "role": m.get("role", ""),
                        "content": m.get("content", ""),
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

            metadata = {}
            if record.get("metadata"):
                try:
                    metadata = json.loads(record["metadata"]) if isinstance(record["metadata"], str) else record["metadata"]
                except (json.JSONDecodeError, TypeError):
                    pass

            return Session(
                key=key,
                messages=messages,
                created_at=datetime.fromisoformat(record.get("created", datetime.now().isoformat()).replace("Z", "+00:00")),
                updated_at=datetime.fromisoformat(record.get("updated", datetime.now().isoformat()).replace("Z", "+00:00")),
                metadata=metadata,
                last_consolidated=record.get("last_consolidated", 0),
                _pb_session_id=pb_session_id,
            )
        except Exception as e:
            logger.warning("PB: failed to load session {}: {}", key, e)
            return None

    async def _pb_save(self, session: Session) -> None:
        """Save session and messages to PocketBase."""
        try:
            # Upsert session record
            session_data = {
                "key": session.key,
                "last_consolidated": session.last_consolidated,
                "metadata": json.dumps(session.metadata),
            }

            if session._pb_session_id:
                await self._pb.update_record("sessions", session._pb_session_id, session_data)
            else:
                # Try to find existing
                result = await self._pb.query_records(
                    "sessions", filter_expr=f'key = "{session.key}"', per_page=1,
                )
                items = result.get("items", [])
                if items:
                    session._pb_session_id = items[0]["id"]
                    await self._pb.update_record("sessions", session._pb_session_id, session_data)
                else:
                    result = await self._pb.insert_record("sessions", session_data)
                    session._pb_session_id = result.get("id")

            if not session._pb_session_id:
                return

            # Sync messages: delete all existing, re-insert current
            # (Simple approach; optimize with incremental sync later)
            existing = await self._pb.query_records(
                "messages",
                filter_expr=f'session = "{session._pb_session_id}"',
                per_page=1,
            )
            total_existing = existing.get("totalItems", 0)

            if total_existing > 0:
                # Delete in batches
                page = 1
                while True:
                    batch = await self._pb.query_records(
                        "messages",
                        filter_expr=f'session = "{session._pb_session_id}"',
                        page=1,  # always page 1 since we're deleting
                        per_page=100,
                    )
                    items = batch.get("items", [])
                    if not items:
                        break
                    for item in items:
                        await self._pb.delete_record("messages", item["id"])

            # Insert all current messages
            for i, msg in enumerate(session.messages):
                extra_fields = {}
                for k in ("tool_calls", "tool_call_id", "name", "reasoning_content"):
                    if k in msg:
                        extra_fields[k] = msg[k]

                await self._pb.insert_record("messages", {
                    "session": session._pb_session_id,
                    "role": msg.get("role", ""),
                    "content": msg.get("content", ""),
                    "timestamp": msg.get("timestamp", ""),
                    "position": i,
                    "extra": json.dumps(extra_fields) if extra_fields else "",
                })
        except Exception as e:
            logger.warning("PB: failed to save session {}: {}, falling back to JSONL", session.key, e)
            self._save_jsonl(session)

    async def _pb_list_sessions(self) -> list[dict[str, Any]]:
        """List all sessions from PocketBase."""
        try:
            result = await self._pb.query_records("sessions", sort="-updated", per_page=100)
            return [
                {
                    "key": item.get("key", ""),
                    "created_at": item.get("created", ""),
                    "updated_at": item.get("updated", ""),
                    "id": item.get("id", ""),
                }
                for item in result.get("items", [])
            ]
        except Exception as e:
            logger.warning("PB: failed to list sessions: {}", e)
            return self._list_sessions_jsonl()

    # ── JSONL backend (fallback) ─────────────────────────────────────

    def _get_session_path(self, key: str) -> Path:
        safe_key = safe_filename(key.replace(":", "_"))
        return self.sessions_dir / f"{safe_key}.jsonl"

    def _get_legacy_session_path(self, key: str) -> Path:
        safe_key = safe_filename(key.replace(":", "_"))
        return self.legacy_sessions_dir / f"{safe_key}.jsonl"

    def _load_jsonl(self, key: str) -> Session | None:
        """Load a session from JSONL files."""
        path = self._get_session_path(key)
        if not path.exists():
            legacy_path = self._get_legacy_session_path(key)
            if legacy_path.exists():
                try:
                    shutil.move(str(legacy_path), str(path))
                    logger.info("Migrated session {} from legacy path", key)
                except Exception:
                    logger.exception("Failed to migrate session {}", key)

        if not path.exists():
            return None

        try:
            messages = []
            metadata = {}
            created_at = None
            updated_at = None
            last_consolidated = 0

            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    data = json.loads(line)
                    if data.get("_type") == "metadata":
                        metadata = data.get("metadata", {})
                        created_at = datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None
                        updated_at = datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
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
        except Exception as e:
            logger.warning("Failed to load session {}: {}", key, e)
            return None

    def _save_jsonl(self, session: Session) -> None:
        """Save a session to JSONL files."""
        path = self._get_session_path(session.key)
        with open(path, "w", encoding="utf-8") as f:
            metadata_line = {
                "_type": "metadata",
                "key": session.key,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
                "metadata": session.metadata,
                "last_consolidated": session.last_consolidated,
            }
            f.write(json.dumps(metadata_line, ensure_ascii=False) + "\n")
            for msg in session.messages:
                f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    def _list_sessions_jsonl(self) -> list[dict[str, Any]]:
        """List sessions from JSONL files."""
        sessions = []
        for path in self.sessions_dir.glob("*.jsonl"):
            try:
                with open(path, encoding="utf-8") as f:
                    first_line = f.readline().strip()
                    if first_line:
                        data = json.loads(first_line)
                        if data.get("_type") == "metadata":
                            key = data.get("key") or path.stem.replace("_", ":", 1)
                            sessions.append({
                                "key": key,
                                "created_at": data.get("created_at"),
                                "updated_at": data.get("updated_at"),
                                "path": str(path),
                            })
            except Exception:
                continue
        return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)
