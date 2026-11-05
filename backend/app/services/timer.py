"""The person's timer as the API and the websocket describe it. Nothing in here changes a timer; tasks.py does, then calls publish_change."""
import logging
from datetime import datetime, timezone

from beanie import PydanticObjectId

from app.core.permissions import can
from app.core.timeutil import as_utc
from app.models import Subfolder, Task, TimeLog, User
from app.models.task import OPEN_STATUSES
from app.schemas.task import TimerCurrent, TimerTask
from app.services.projects import brief, subfolders_of
from app.services.ws_manager import manager

log = logging.getLogger(__name__)


def task_out(task: Task, live: int = 0) -> TimerTask:
    return TimerTask(
        id=task.id, title=task.title, subfolder_id=task.subfolder_id, progress=task.progress, total_seconds=task.total_seconds + max(0, live)
    )


async def stopped_task(logs: list[TimeLog], keep: PydanticObjectId | None = None) -> TimerTask | None:
    """The task of the session that was just closed (not when it was the same task again)."""
    for entry in logs:
        if entry.task_id != keep and (task := await Task.get(entry.task_id)):
            return task_out(task)
    return None


async def resumable(user: User) -> Task | None:
    """The task the person paused last, if they can still work on it."""
    last = await TimeLog.find(TimeLog.user_id == user.id, TimeLog.running == False).sort("-ended_at").first_or_none()  # noqa: E712
    task = await Task.get(last.task_id) if last else None
    if task is None or task.status not in OPEN_STATUSES:
        return None
    sub = await Subfolder.get(task.subfolder_id)
    return task if can(user, "task.work", sub, target_id=task.assignee_id) else None


async def current_state(user: User, *, stopped: TimerTask | None = None) -> TimerCurrent:
    now = datetime.now(timezone.utc)
    entry = await TimeLog.find_one(TimeLog.user_id == user.id, TimeLog.running == True)  # noqa: E712
    if entry and (task := await Task.get(entry.task_id)):
        started = as_utc(entry.started_at)
        return TimerCurrent(
            server_now=now,
            state="running",
            task=task_out(task, int((now - started).total_seconds())),
            started_at=started,
            stopped_task=stopped,
        )
    paused = await resumable(user)
    return TimerCurrent(
        server_now=now, state="paused" if paused else "idle", task=task_out(paused) if paused else None, stopped_task=stopped
    )


async def viewers(subfolder: Subfolder) -> list[PydanticObjectId]:
    """Everyone who can open the subfolder (the rule behind `subfolder.view`): its members, admins, and the project's companies when it is shared."""
    ids = {*subfolder.head_ids, *subfolder.member_ids}
    admins = await User.find(User.role == "admin", User.is_active == True).to_list()  # noqa: E712
    ids |= {a.id for a in admins}
    if subfolder.visibility != "private" and subfolder.company_ids:
        team = await User.find({"company_id": {"$in": subfolder.company_ids}, "role": {"$in": ["admin", "employee"]}, "is_active": True}).to_list()
        ids |= {u.id for u in team}
    return list(ids)


async def publish_change(user_id: PydanticObjectId, *, started: TimeLog | None = None, stopped: list[TimeLog] | None = None) -> None:
    """
    Tell everyone who needs to know that `user_id`'s timer moved:
      - `timer` to all of the person's own tabs and devices, so every screen shows the same state;
      - `presence` to the people who can open the subfolder of each task involved ("working now").
    Never raises: a socket problem must not undo or fail the timer action.
    """
    try:
        user = await User.get(user_id)
        if user is None:
            return
        state = await current_state(user)
        await manager.send_to_users([user_id], "timer", state.model_dump(mode="json"))
        events = [(entry, False) for entry in stopped or []] + ([(started, True)] if started else [])
        for entry, running in events:
            task = await Task.get(entry.task_id)
            sub = await Subfolder.get(task.subfolder_id) if task else None
            if sub is None:
                continue
            await manager.send_to_users(
                await viewers(sub),
                "presence",
                {
                    "subfolder_id": str(sub.id),
                    "task_id": str(entry.task_id),
                    "running": running,
                    "started_at": as_utc(entry.started_at).isoformat() if running else None,
                    "user": brief(user).model_dump(mode="json"),
                },
            )
    except Exception:  # noqa: BLE001
        log.exception("could not publish a timer change")
