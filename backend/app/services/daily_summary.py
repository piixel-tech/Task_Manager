"""The morning summary email (9:30 IST): one per admin or employee, only when there is something to show.

Tasks due today, overdue tasks, reviews waiting for them, meetings today, and for admins the leave requests waiting for them.
Every item links to its page. People switch it off in Settings > Notifications (on by default). The in-app "Your day"
notification is separate and unchanged.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.core.timeutil import as_utc, today_local, tz
from app.models import Booking, EmailLog, LeaveRequest, Task, TaskReview, User
from app.models.task import OPEN_STATUSES
from app.services import email as mail
from app.services.email_template import Section, render_digest
from app.services.prefs import settings_of
from app.services.tasks import link_for

log = logging.getLogger(__name__)

SHOWN = 8  # items listed per section; the rest sit behind a "+N more" link
TYPE = "daily_summary"


def _home(user: User) -> str:
    return "/admin" if user.role == "admin" else "/app"


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def _day_bounds(day) -> tuple[datetime, datetime]:
    start = datetime.combine(day, datetime.min.time(), tzinfo=tz()).astimezone(timezone.utc)
    return start, start + timedelta(days=1)


def _task_items(user: User, tasks: list[Task]) -> list[tuple[str, str, str]]:
    return [(t.title, f"Due {t.due_date}", link_for(user, t.id)) for t in tasks]


async def build_sections(user: User) -> list[tuple[str, int, Section]]:
    """[(key, total, section)] for what this person has today; empty when there is nothing."""
    base = _home(user)
    today = today_local()
    day = today.isoformat()
    out: list[tuple[str, int, Section]] = []

    def add(key: str, title: str, total: int, items: list[tuple[str, str, str]], more_path: str) -> None:
        if total:
            more = (f"+{total - len(items)} more", more_path) if total > len(items) else None
            out.append((key, total, (title, items, more)))

    open_mine = {"assignee_id": user.id, "status": {"$in": list(OPEN_STATUSES)}}
    due = await Task.find({**open_mine, "due_date": day}).sort("title").to_list()
    add("due", "Due today", len(due), _task_items(user, due[:SHOWN]), f"{base}/tasks")
    late = await Task.find({**open_mine, "due_date": {"$lt": day, "$nin": [None, ""]}}).sort("due_date").to_list()
    add("overdue", "Overdue", len(late), _task_items(user, late[:SHOWN]), f"{base}/tasks")

    reviews = await TaskReview.find({"approver_id": user.id, "decision": "pending"}).sort("created_at").to_list()
    if reviews:
        titles = {t.id: t for t in await Task.find({"_id": {"$in": [r.task_id for r in reviews]}}).to_list()}
        people = {p.id: p for p in await User.find({"_id": {"$in": [r.submitted_by for r in reviews]}}).to_list()}
        items = [
            (titles[r.task_id].title, f"From {people[r.submitted_by].name}" if r.submitted_by in people else "", link_for(user, r.task_id))
            for r in reviews
            if r.task_id in titles
        ][:SHOWN]
        add("reviews", "Waiting for your review", len([r for r in reviews if r.task_id in titles]), items, f"{base}/reviews")

    start, end = _day_bounds(today)
    meetings = await Booking.find(
        {"start": {"$gte": start, "$lt": end}, "$or": [{"host_user_id": user.id}, {"booked_by": user.id}, {"attendees.user_id": user.id}]}
    ).sort("start").to_list()
    add(
        "meetings", "Meetings today", len(meetings),
        [(b.title, as_utc(b.start).astimezone(tz()).strftime("%H:%M") + "–" + as_utc(b.end).astimezone(tz()).strftime("%H:%M"), f"{base}/calendar/{b.host_user_id}") for b in meetings[:SHOWN]],
        f"{base}/calendar",
    )

    if user.role == "admin":
        pending = await LeaveRequest.find({"admin_id": user.id, "status": "pending", "deleted_at": None}).sort("created_at").to_list()
        if pending:
            who = {p.id: p for p in await User.find({"_id": {"$in": [r.user_id for r in pending]}}).to_list()}
            from app.services.leave_requests import TYPE_LABEL, when_text

            items = [
                (f"{who[r.user_id].name if r.user_id in who else 'Someone'}: {TYPE_LABEL[r.type]}", when_text(r), "/admin/leave-requests")
                for r in pending[:SHOWN]
            ]
            add("leave", "Leave requests waiting", len(pending), items, "/admin/leave-requests")
    return out


def _subject(parts: list[tuple[str, int, Section]]) -> str:
    words = {"due": "due today", "overdue": "overdue", "reviews": "to review", "meetings": "meetings", "leave": "leave requests"}
    return "Your day: " + ", ".join(f"{n} {words[k]}" for k, n, _ in parts)


async def _already_sent(user: User) -> bool:
    start, _ = _day_bounds(today_local())
    return await EmailLog.find({"to": user.email, "type": TYPE, "created_at": {"$gte": start}}).count() > 0


async def send_summary(user: User) -> bool:
    """Email this person their summary if they want it, haven't had it today and there is something. True when queued."""
    if not user.is_active or user.role not in ("admin", "employee") or not settings_of(user).notif_prefs.daily_email:
        return False
    parts = await build_sections(user)
    if not parts or await _already_sent(user):
        return False
    first = user.name.split()[0] if user.name.strip() else "there"
    html, plain = render_digest(
        f"Good morning, {first}", f"Here is your day, {today_local():%A %d %B}.", [s for _, _, s in parts], "Open Task Manager", f"{_home(user)}/dashboard"
    )
    await mail.send_rendered(user.email, TYPE, _subject(parts), html, plain)
    return True


async def run_daily_summary() -> int:
    """The scheduled job. One person's failure never stops the others."""
    sent = 0
    for user in await User.find({"is_active": True, "role": {"$in": ["admin", "employee"]}}).to_list():
        try:
            sent += await send_summary(user)
        except Exception:  # noqa: BLE001
            log.exception("Morning summary for one person failed")
    return sent
