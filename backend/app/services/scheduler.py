import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings
from app.core.timeutil import tz
from app.integrations.runner import run_integration_sync
from app.services.approvals import run_approval_reminders
from app.services.reminders import run_reminders
from app.services.scheduled import run_scheduled_sends
from app.services.trash import purge_expired

log = logging.getLogger(__name__)
scheduler = AsyncIOScheduler(timezone=settings.TIMEZONE)


async def _reminder_job() -> None:
    try:
        sent = await run_reminders()
        log.info("Task reminders sent: %s", sent)
    except Exception:  # a failed run must not kill the scheduler
        log.exception("Task reminder job failed")


async def _approval_reminder_job() -> None:
    try:
        sent = await run_approval_reminders()
        if sent:
            log.info("Approval reminders sent: %s", sent)
    except Exception:
        log.exception("Approval reminder job failed")


async def _scheduled_send_job() -> None:
    try:
        sent = await run_scheduled_sends()
        if sent:
            log.info("Scheduled messages sent: %s", sent)
    except Exception:
        log.exception("Scheduled message job failed")


async def _integration_sync_job() -> None:
    try:
        n = await run_integration_sync()
        if n:
            log.info("Connected apps synced: %s", n)
    except Exception:
        log.exception("Connected apps sync failed")


async def _trash_job() -> None:
    try:
        purged = await purge_expired()
        if purged:
            log.info("Trash items purged: %s", purged)
    except Exception:
        log.exception("Trash purge failed")


def start_scheduler() -> None:
    if not settings.SCHEDULER_ENABLED or scheduler.running:
        return
    scheduler.add_job(
        _reminder_job,
        CronTrigger(hour=settings.REMINDER_HOUR, minute=0),
        id="task_reminders",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
    )
    # Checked often, but each approval is only due once every 24 hours.
    scheduler.add_job(
        _approval_reminder_job,
        IntervalTrigger(minutes=10),
        id="approval_reminders",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _trash_job,
        CronTrigger(hour=3, minute=30),
        id="trash_purge",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        _scheduled_send_job,
        IntervalTrigger(seconds=30),
        id="scheduled_messages",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(
        _integration_sync_job,
        IntervalTrigger(minutes=max(1, settings.GOOGLE_SYNC_MINUTES)),
        id="integrations_sync",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    # Catch-up if the server was down at the usual time. Safe to repeat: reminders are once per task per day.
    if datetime.now(tz()).hour >= settings.REMINDER_HOUR:
        scheduler.add_job(_reminder_job, id="task_reminders_startup", replace_existing=True)


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
