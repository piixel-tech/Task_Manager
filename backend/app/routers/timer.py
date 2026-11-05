"""The person's one timer: play a task, pause, resume. Per-task start/stop (tasks.py) uses the same sessions and the same rules."""
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import Task, TimeLog, User
from app.core.timeutil import as_utc
from app.services.tasks import get_task_or_404, now_utc
from app.schemas.task import TimerCurrent, TimerLogEntry, TimerLogOut, TimerStart, WorkingNow
from app.services.projects import brief, get_subfolder_or_404, load_users, subfolders_of
from app.services.tasks import begin_timer, stop_timers, workable_task
from app.services.timer import current_state, resumable, stopped_task

router = APIRouter(prefix="/timer", tags=["timer"])


@router.get("/current", response_model=TimerCurrent)
async def get_current(user: User = Depends(get_current_user)) -> TimerCurrent:
    return await current_state(user)


@router.post("/start", response_model=TimerCurrent)
async def start(body: TimerStart, user: User = Depends(get_current_user)) -> TimerCurrent:
    """Play a task: the timer running elsewhere is closed and this one opened. Playing the task already running changes nothing."""
    task = await workable_task(body.task_id, user)
    if await TimeLog.find_one(TimeLog.user_id == user.id, TimeLog.task_id == task.id, TimeLog.running == True):  # noqa: E712
        return await current_state(user)
    stopped = await begin_timer(task, user)
    return await current_state(user, stopped=await stopped_task(stopped, keep=task.id))


@router.post("/pause", response_model=TimerCurrent)
async def pause(user: User = Depends(get_current_user)) -> TimerCurrent:
    stopped = await stop_timers(user_id=user.id)
    if not stopped:
        raise HTTPException(status.HTTP_409_CONFLICT, "No timer is running")
    return await current_state(user)


@router.post("/resume", response_model=TimerCurrent)
async def resume(user: User = Depends(get_current_user)) -> TimerCurrent:
    """Carry on with the task paused last, as a new session."""
    if await TimeLog.find_one(TimeLog.user_id == user.id, TimeLog.running == True):  # noqa: E712
        raise HTTPException(status.HTTP_409_CONFLICT, "A timer is already running")
    task = await resumable(user)
    if task is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "There is no paused timer to resume")
    await begin_timer(task, user)
    return await current_state(user)


@router.get("/log/{task_id}", response_model=TimerLogOut)
async def timer_log(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> TimerLogOut:
    """Every timer session on a task, newest first. Read-only; for the assignee, the subfolder's heads and admins."""
    task = await get_task_or_404(task_id)
    sub = await get_subfolder_or_404(task.subfolder_id)
    if not (user.role == "admin" or task.assignee_id == user.id or user.id in sub.head_ids):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the assignee, the subfolder head and admins can see the timer log")
    logs = await TimeLog.find(TimeLog.task_id == task.id).sort("-started_at").to_list()
    people = await load_users(e.user_id for e in logs)
    now = now_utc()
    entries = [
        TimerLogEntry(id=e.id, user=brief(people[e.user_id]), started_at=as_utc(e.started_at), ended_at=as_utc(e.ended_at) if e.ended_at else None, seconds=e.seconds, running=e.running)
        for e in logs
        if e.user_id in people
    ]
    total = sum(e.seconds if not e.running else max(0, int((now - as_utc(e.started_at)).total_seconds())) for e in logs)
    return TimerLogOut(server_now=now, total_seconds=total, entries=entries)


@router.get("/working/{subfolder_id}", response_model=list[WorkingNow])
async def working_now(subfolder_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[WorkingNow]:
    """Who has a timer running on a task of this subfolder right now. Only for people who can open the subfolder."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "subfolder.view", sub, siblings=await subfolders_of(sub.project_id))
    ids = [t.id for t in await Task.find(Task.subfolder_id == sub.id).to_list()]
    logs = await TimeLog.find({"task_id": {"$in": ids}, "running": True}).to_list() if ids else []
    people = await load_users(entry.user_id for entry in logs)
    return [
        WorkingNow(task_id=e.task_id, started_at=as_utc(e.started_at), user=brief(people[e.user_id]))
        for e in logs
        if e.user_id in people
    ]
