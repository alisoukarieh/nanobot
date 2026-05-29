"""Cron restart-recovery + timer-safety regression tests.

Covers the bugs where a one-shot ``at`` reminder due during downtime was
silently dropped on restart, where ``every`` jobs restarted their countdown on
every boot, and where re-arming the timer mid-run cancelled the in-flight job.
"""

import asyncio
import time

import pytest

from nanobot.cron.service import CronService, _compute_next_every
from nanobot.cron.types import CronSchedule


def _ms(seconds_from_now: float) -> int:
    return int(time.time() * 1000) + int(seconds_from_now * 1000)


async def _add_persisted(path, **kwargs) -> str:
    """Add a job through a *running* service so it lands in jobs.json (the
    production path), then stop. Returns the job id."""
    svc = CronService(path)
    await svc.start()
    job = svc.add_job(**kwargs)
    svc.stop()
    return job.id


def _restart_and_recompute(path) -> CronService:
    """Mirror what start() does on boot: load -> recompute -> persist."""
    fresh = CronService(path)
    fresh._load_store()
    fresh._recompute_next_runs()
    fresh._save_store()
    return fresh


@pytest.mark.asyncio
async def test_recompute_preserves_recently_overdue_at_job(tmp_path) -> None:
    """An ``at`` job whose moment passed during downtime must fire on next tick,
    not be nulled out (the silent-reminder-loss bug)."""
    path = tmp_path / "cron" / "jobs.json"
    past = _ms(-60)  # one minute ago, well within grace
    jid = await _add_persisted(
        path, name="pay bill",
        schedule=CronSchedule(kind="at", at_ms=past),
        message="reminder", delete_after_run=True,
    )
    fresh = _restart_and_recompute(path)
    recovered = next(j for j in fresh._store.jobs if j.id == jid)
    assert recovered.enabled is True
    assert recovered.state.next_run_at_ms == past  # preserved -> due now -> fires


@pytest.mark.asyncio
async def test_recompute_disables_at_job_overdue_beyond_grace(tmp_path) -> None:
    path = tmp_path / "cron" / "jobs.json"
    stale = _ms(-(48 * 3600))  # 48h ago, beyond the 24h grace
    jid = await _add_persisted(
        path, name="ancient",
        schedule=CronSchedule(kind="at", at_ms=stale),
        message="reminder", delete_after_run=True,
    )
    fresh = _restart_and_recompute(path)
    recovered = next(j for j in fresh._store.jobs if j.id == jid)
    assert recovered.enabled is False
    assert recovered.state.next_run_at_ms is None
    assert recovered.state.last_status == "skipped"


@pytest.mark.asyncio
async def test_recompute_future_at_job_unchanged(tmp_path) -> None:
    path = tmp_path / "cron" / "jobs.json"
    future = _ms(3600)
    jid = await _add_persisted(
        path, name="later",
        schedule=CronSchedule(kind="at", at_ms=future),
        message="reminder", delete_after_run=True,
    )
    fresh = _restart_and_recompute(path)
    recovered = next(j for j in fresh._store.jobs if j.id == jid)
    assert recovered.state.next_run_at_ms == future


def test_compute_next_every_anchors_to_last_run() -> None:
    every = 7_200_000  # 2h
    now = 10 * every
    last_run = now - every - 1000  # ran just over an interval ago -> overdue
    nxt = _compute_next_every(CronSchedule(kind="every", every_ms=every), last_run, now)
    # First multiple of `every` after now, anchored to last_run (not now+every).
    assert nxt is not None
    assert now < nxt <= now + every
    assert (nxt - last_run) % every == 0


def test_compute_next_every_no_anchor_falls_back_to_now() -> None:
    every = 60_000
    now = 1_000_000
    assert _compute_next_every(CronSchedule(kind="every", every_ms=every), None, now) == now + every


@pytest.mark.asyncio
async def test_arm_timer_does_not_cancel_running_job(tmp_path) -> None:
    """Adding a job while another is executing must NOT abort the running job
    (the _arm_timer self-cancel race)."""
    store_path = tmp_path / "cron" / "jobs.json"
    completed: list[str] = []
    started = asyncio.Event()

    async def slow_job(job) -> None:
        if job.name == "slow":
            started.set()
            await asyncio.sleep(0.3)
            completed.append(job.id)

    service = CronService(store_path, on_job=slow_job, max_sleep_ms=10)
    service.add_job(
        name="slow",
        schedule=CronSchedule(kind="at", at_ms=_ms(-1)),  # due now
        message="run me",
        delete_after_run=True,
    )
    await service.start()
    try:
        await asyncio.wait_for(started.wait(), timeout=1.0)
        # Mid-run: a user schedules a reminder. This re-arms the timer.
        service.add_job(
            name="reminder",
            schedule=CronSchedule(kind="at", at_ms=_ms(60)),
            message="later",
            delete_after_run=True,
        )
        # The in-flight slow job must still complete despite the re-arm.
        await asyncio.sleep(0.5)
        assert completed, "running cron job was aborted by _arm_timer re-arm"
    finally:
        service.stop()
