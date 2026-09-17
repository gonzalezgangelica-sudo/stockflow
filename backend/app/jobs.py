from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .config import get_settings
from .data.snapshots import take_snapshot
from .db import SessionLocal

_scheduler: BackgroundScheduler | None = None


def _job() -> None:
    db = SessionLocal()
    try:
        take_snapshot(db)
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    settings = get_settings()
    if not settings.run_scheduler:
        return
    hour = settings.snapshot_hour
    minute = settings.snapshot_minute
    _scheduler = BackgroundScheduler(timezone=settings.timezone)
    _scheduler.add_job(_job, CronTrigger(hour=hour, minute=minute, timezone=settings.timezone), id="daily_snapshot", replace_existing=True)
    _scheduler.start()
