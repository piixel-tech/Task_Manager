"""Time-based notifications: snoozed ones coming back, the 9:30 digest, a timer left running at night, meetings about to start."""
from datetime import datetime, timedelta, timezone

from app.core.timeutil import as_utc, today_local, tz
from app.models import Booking, DailyStatus, Notification, Task, TaskReview, TimeLog, User
from app.models.task import OPEN_STATUSES
from app.services.focus import focused_ids
from app.services.notify import notify, outs_with_actors
from app.services.ws_manager import manager


def _home(user: User) -> str:
    return {"admin": "/admin", "client": "/client"}.get(user.role, "/app")


def _start_of_local_day() -> datetime:
    local = datetime.now(tz()).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.astimezone(timezone.utc)


async def _already_today(user_id, type: str) -> bool:
    return await Notification.find({"user_id": user_id, "type": type, "created_at": {"$gte": _start_of_local_day()}}).count() > 0


async def run_snoozed(now: datetime | None = None) -> int:
    """Snoozed notifications whose time has come return as new and unread, live."""
    now = now or datetime.now(timezone.utc)
    due = await Notification.find({"snoozed_until": {"$ne": None, "$lte": now}}).to_list()
    back = 0
    for n in due:
        title = n.title if n.title.startswith("Reminder: ") else f"Reminder: {n.title}"
        claimed = await Notification.find({"_id": n.id, "snoozed_until": n.snoozed_until}).update(
            {"$set": {"snoozed_until": None, "read": False, "created_at": now, "title": title}}
        )
        if not claimed or claimed.modified_count != 1:
            continue
        back += 1
        if n.user_id in await focused_ids([n.user_id]):
            continue
        fresh = await Notification.get(n.id)
        if fresh:
            out = (await outs_with_actors([fresh]))[0]
            await manager.send_to_users([n.user_id], "notification", out.model_dump(mode="json"))
    return back


async def run_digest() -> int:
    """Once a day at 9:30: what is due today, reviews waiting, and who is on leave. Nothing to say means no notification."""
    day = today_local().isoformat()
    leave = await DailyStatus.find({"date": day, "status": "leave"}).to_list()
    names = [u.name for u in await User.find({"_id": {"$in": [d.user_id for d in leave]}}).to_list()] if leave else []
    sent = 0
    for user in await User.find({"is_active": True, "role": {"$in": ["admin", "employee"]}}).to_list():
        if await _already_today(user.id, "daily_digest"):
            continue
        due = await Task.find({"assignee_id": user.id, "due_date": day, "status": {"$in": list(OPEN_STATUSES)}}).count()
        reviews = await TaskReview.find({"approver_id": user.id, "decision": "pending"}).count()
        away = [n for n in names if n != user.name]
        parts = []
        if due:
            parts.append(f"{due} task{'s' if due != 1 else ''} due today")
        if reviews:
            parts.append(f"{reviews} review{'s' if reviews != 1 else ''} waiting")
        if away:
            parts.append("On leave: " + ", ".join(away[:4]) + (f" +{len(away) - 4}" if len(away) > 4 else ""))
        if not parts:
            continue
        await notify([user.id], "daily_digest", "Your day", ". ".join(parts) + ".", _home(user))
        sent += 1
    return sent


async def run_late_timers() -> int:
    """After 8 PM, tell people whose timer is still running (once a day)."""
    if datetime.now(tz()).hour < 20:
        return 0
    sent = 0
    for log in await TimeLog.find({"running": True}).to_list():
        user = await User.get(log.user_id)
        if user is None or not user.is_active or await _already_today(user.id, "timer_running_late"):
            continue
        task = await Task.get(log.task_id)
        title = task.title if task else "a task"
        link = f"{_home(user)}/tasks/{log.task_id}" if task and user.role != "client" else _home(user)
        await notify([user.id], "timer_running_late", "Your timer is still running", f"{title} has been timing since {as_utc(log.started_at).astimezone(tz()):%H:%M}.", link)
        sent += 1
    return sent


async def run_meeting_reminders(now: datetime | None = None) -> int:
    """A meeting starting within 10 minutes: tell the host, whoever booked it, and invited teammates (once)."""
    now = now or datetime.now(timezone.utc)
    sent = 0
    for b in await Booking.find({"remind_sent": False, "start": {"$gt": now, "$lte": now + timedelta(minutes=10)}}).to_list():
        claimed = await Booking.find({"_id": b.id, "remind_sent": False}).update({"$set": {"remind_sent": True}})
        if not claimed or claimed.modified_count != 1:
            continue
        ids = [b.host_user_id, b.booked_by, *[a.user_id for a in b.attendees if a.user_id]]
        for user in await User.find({"_id": {"$in": list(dict.fromkeys(ids))}, "is_active": True}).to_list():
            base = "/client/meetings" if user.role == "client" else f"{_home(user)}/calendar"
            when = as_utc(b.start).astimezone(tz()).strftime("%H:%M")
            await notify([user.id], "booking_starting", f"Starting soon: {b.title}", f"Your meeting starts at {when}." + (f" Join: {b.meet_url}" if b.meet_url else ""), base)
        sent += 1
    return sent
