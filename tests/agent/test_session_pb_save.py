"""Regression tests for SessionManager._pb_save hardening.

Covers the PocketBase 5000-char (max:0) field-cap failure mode: previously a
rejected message was swallowed and re-POSTed forever (history holes + log
spam). Now an over-cap message is truncated so it lands; a truly unsavable one
is marked `_pb_skip` (never retried); and a transient failure defers the rest
in order instead of persisting a later message ahead of an unsaved earlier one.
"""

import pytest

from nanobot.agent.tools.pocketbase import PocketBaseError
from nanobot.session.manager import Session, SessionManager


class FakePB:
    def __init__(self, insert_behavior=None):
        self.inserted: list[dict] = []
        self.insert_behavior = insert_behavior  # (data) -> raise / None(proceed)
        self.update_calls: list[tuple] = []

    async def query_records(self, collection, filter_expr="", sort="", page=1, per_page=20):
        if collection == "messages" and self.inserted:
            top = max(self.inserted, key=lambda r: r["position"])
            return {"items": [{"position": top["position"]}]}
        return {"items": []}

    async def insert_record(self, collection, data):
        if collection == "messages" and self.insert_behavior:
            self.insert_behavior(data)  # may raise
        rec = dict(data)
        rec["id"] = f"id{len(self.inserted)}"
        self.inserted.append(rec)
        return rec

    async def update_record(self, collection, record_id, data):
        self.update_calls.append((record_id, data))
        return {"id": record_id}


def _cap(limit: int):
    def beh(data):
        if len(data.get("content", "")) > limit or len(data.get("extra", "")) > limit:
            raise PocketBaseError(f"Failed to create record. — content: Must be no more than {limit} character(s).", 400)
    return beh


def _session(tmp_path, *messages) -> tuple[SessionManager, Session]:
    sm = SessionManager(tmp_path, pb_client=None)  # set below to skip JSONL
    s = Session(key="whatsapp:test")
    s._pb_session_id = "sess1"
    s.messages.extend(messages)
    return sm, s


@pytest.mark.asyncio
async def test_oversized_content_is_truncated_and_persisted(tmp_path) -> None:
    pb = FakePB(insert_behavior=_cap(100))
    sm, s = _session(tmp_path, {"role": "tool", "content": "X" * 500})
    sm._pb = pb

    await sm.save(s)

    assert len(pb.inserted) == 1
    stored = pb.inserted[0]["content"]
    assert len(stored) <= 100
    assert "truncated" in stored
    assert s.messages[0]["_pb_id"] == "id0"  # landed, won't be retried


@pytest.mark.asyncio
async def test_permanently_unsavable_message_is_skipped_not_retried(tmp_path) -> None:
    # Reject anything from role "huge" even after truncation; a normal msg lands.
    def beh(data):
        if data.get("role") == "huge":
            raise PocketBaseError("Failed. — content: Must be no more than 5000 character(s).", 400)

    pb = FakePB(insert_behavior=beh)
    sm, s = _session(
        tmp_path,
        {"role": "huge", "content": "x"},
        {"role": "assistant", "content": "ok"},
    )
    sm._pb = pb

    await sm.save(s)
    # second message persisted; first marked skip
    assert s.messages[0].get("_pb_skip") is True
    assert "_pb_id" not in s.messages[0]
    assert s.messages[1]["_pb_id"] == "id0"

    # A subsequent save must NOT re-attempt the skipped message.
    before = len(pb.inserted)
    await sm.save(s)
    assert len(pb.inserted) == before


@pytest.mark.asyncio
async def test_transient_failure_defers_in_order(tmp_path) -> None:
    state = {"fail": True}

    def beh(data):
        if state["fail"]:
            raise PocketBaseError("PocketBase POST failed after 4 attempts: ConnectTimeout", 0)

    pb = FakePB(insert_behavior=beh)
    sm, s = _session(
        tmp_path,
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "second"},
    )
    sm._pb = pb

    await sm.save(s)  # transient -> nothing persisted (deferred), no partial/out-of-order
    assert pb.inserted == []
    assert all("_pb_id" not in m for m in s.messages)

    # PB recovers; next save persists both in order.
    state["fail"] = False
    await sm.save(s)
    assert [r["content"] for r in pb.inserted] == ["first", "second"]
    assert [r["position"] for r in pb.inserted] == [0, 1]
