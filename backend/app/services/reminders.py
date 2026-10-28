from datetime import date

from app.core.timeutil import today_local
from app.models import Task, User
from app.models.task import OPEN_STATUSES
from app.services.tasks import notify_task

REMIND_FROM_DAYS_BEFORE = 2


def _when(days_left: int) -> str:
    if days_left > 1:
        return f"is due in {days_left} days"
    if days_left == 1:
        return "is due tomorrow"
    if days_left == 0:
        return "is due today"
    late = -days_left
    return f"is overdue by {late} day{'s' if late != 1 else ''}"


async def run_reminders(today: date | None = None) -> int:
    """Remind assignees about tasks due within 2 days (or overdue) that they haven't submitted.

    Sends at most one reminder per task per day, so running it again, or from two
    processes at once, never double-notifies. Returns how many reminders were sent.
    """
    day = today or today_local()
    day_str = day.isoformat()
    sent = 0

    candidates = await Task.find(
        {"due_date": {"$ne": None}, "status": {"$in": list(OPEN_STATUSES)}, "last_reminded_on": {"$ne": day_str}}
    ).to_list()

    for task in candidates:
        days_left = (date.fromisoformat(task.due_date) - day).days
        if days_left > REMIND_FROM_DAYS_BEFORE:
            continue
        # Claim today's reminder atomically before sending.
        claimed = await Task.find({"_id": task.id, "last_reminded_on": {"$ne": day_str}}).update(
            {"$set": {"last_reminded_on": day_str}}
        )
        if not claimed or claimed.modified_count != 1:
            continue
        assignee = await User.get(task.assignee_id)
        if assignee is None or not assignee.is_active:
            continue
        await notify_task(
            [task.assignee_id],
            type="task_reminder",
            title=f"Reminder: {task.title}",
            body=f"This task {_when(days_left)}.",
            task=task,
            actor=None,
        )
        sent += 1
    return sent
