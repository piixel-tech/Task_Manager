from datetime import date

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.core.permissions import require
from app.core.timeutil import today_local
from app.integrations.runner import schedule_push
from app.models import File, Subfolder, Task, TimeLog, User
from app.models.chat import ChatMessage
from app.models.task import OPEN_STATUSES, Priority, TaskStatus
from app.schemas.task import ProgressSet, ReminderRun, TaskCreate, TaskOut, TaskUpdate, TimeLogOut, TimerResult
from app.services import richtext
from app.services.activity import log_task
from app.services.chat import member_group, publish_message
from app.services.projects import get_subfolder_or_404, project_ids_for_staff, subfolders_of
from app.services.reminders import run_reminders
from app.services.trash import trash_task
from app.services.tasks import (
    check_assets,
    check_assignee,
    copy_file,
    delete_tasks,
    get_task_or_404,
    notify_task,
    now_utc,
    stop_timers,
    task_outs,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _description(text: str, html: bool) -> tuple[str, bool]:
    """(what to store, is it HTML). Rich descriptions are cleaned and must still say something."""
    if not html:
        return text, False
    clean = richtext.sanitize(text)
    if not richtext.read(clean)[0]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Add a description: it is required")
    return clean, True


async def _viewable(task: Task, user: User) -> Subfolder | None:
    """Raise 403 unless the user may see the task. Returns its subfolder (None if gone)."""
    sub = await Subfolder.get(task.subfolder_id)
    siblings = await subfolders_of(task.project_id)
    require(user, "task.view", sub, siblings=siblings, target_id=task.assignee_id)
    return sub


async def _one(task: Task, user: User) -> TaskOut:
    return (await task_outs([task], user))[0]


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    project_id: PydanticObjectId | None = None,
    subfolder_id: PydanticObjectId | None = None,
    assignee_id: PydanticObjectId | None = None,
    task_status: TaskStatus | None = Query(None, alias="status"),
    mine: bool = False,
    limit: int = Query(200, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
) -> list[TaskOut]:
    """Admins see every task. Team members see tasks in their projects plus tasks assigned to them."""
    if user.role == "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    conditions: list[dict] = []
    if user.role != "admin":
        ids = await project_ids_for_staff(user)
        conditions.append({"$or": [{"project_id": {"$in": ids}}, {"assignee_id": user.id}]})
    if project_id:
        conditions.append({"project_id": project_id})
    if subfolder_id:
        conditions.append({"subfolder_id": subfolder_id})
    if mine:
        conditions.append({"assignee_id": user.id})
    elif assignee_id:
        conditions.append({"assignee_id": assignee_id})
    if task_status:
        conditions.append({"status": task_status})

    query = Task.find({"$and": conditions} if conditions else {})
    tasks = await query.sort("-created_at").skip(skip).limit(limit).to_list()
    return await task_outs(tasks, user)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskCreate, user: User = Depends(get_current_user)) -> TaskOut:
    """Admin: assign anyone. Head: members and other heads of their subfolder. Employee: only themselves."""
    sub = await get_subfolder_or_404(body.subfolder_id)
    require(user, "task.assign", sub, target_id=body.assignee_id)
    assignee = await check_assignee(body.assignee_id)
    await check_assets(body.asset_ids, user)
    description, is_html = _description(body.description, body.html)

    source = group = None
    if body.from_message_id:
        source = await ChatMessage.get(body.from_message_id)
        if source is None or user.id in source.deleted_for:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
        group = await member_group(source.group_id, user)  # you can only turn messages you can read into tasks
        if source.deleted_for_all or source.type == "approval":
            raise HTTPException(status.HTTP_409_CONFLICT, "This message can't be turned into a task")
        if source.task_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "A task was already created from this message")

    asset_ids = list(dict.fromkeys(body.asset_ids))
    if source and source.file_id and (original := await File.get(source.file_id)):
        asset_ids.append((await copy_file(original, user)).id)  # the message's file becomes the task's own attachment

    task = Task(
        subfolder_id=sub.id,
        project_id=sub.project_id,
        title=body.title,
        description=description,
        description_html=is_html,
        assignee_id=body.assignee_id,
        created_by=user.id,
        due_date=body.due_date,
        priority=body.priority,
        asset_ids=asset_ids,
        source_group_id=group.id if group else None,
        source_message_id=source.id if source else None,
    )
    await task.insert()

    if source:  # one task per message; claim it atomically so two people can't both win
        claimed = await ChatMessage.find({"_id": source.id, "task_id": None}).update({"$set": {"task_id": task.id}})
        if not claimed or claimed.modified_count != 1:
            await delete_tasks([task])
            raise HTTPException(status.HTTP_409_CONFLICT, "A task was already created from this message")
        await publish_message(group, await ChatMessage.get(source.id), "chat:message_update")

    await log_task(task, user, "created this task from a chat message" if source else "created this task")
    if task.assignee_id != user.id:
        await log_task(task, user, f"assigned this task to {assignee.name}")

    schedule_push([task.assignee_id])
    due = f" · due {task.due_date}" if task.due_date else ""
    await notify_task(
        [task.assignee_id],
        type="task_assigned",
        title=f"New task: {task.title}",
        body=f"Assigned by {user.name}{due}.",
        task=task,
        actor=user,
    )
    return await _one(task, user)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> TaskOut:
    task = await get_task_or_404(task_id)
    await _viewable(task, user)
    return await _one(task, user)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: PydanticObjectId, body: TaskUpdate, user: User = Depends(get_current_user)) -> TaskOut:
    task = await get_task_or_404(task_id)
    sub = await Subfolder.get(task.subfolder_id)
    require(user, "task.edit", sub, creator_id=task.created_by)
    if task.status == "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "An approved task can't be edited")

    changes = body.model_dump(exclude_unset=True)
    old_assignee = task.assignee_id
    changed: list[str] = []

    if "assignee_id" in changes and changes["assignee_id"] is not None and changes["assignee_id"] != task.assignee_id:
        if task.status == "submitted":
            raise HTTPException(status.HTTP_409_CONFLICT, "Decide the pending review before reassigning this task")
        require(user, "task.assign", sub, target_id=changes["assignee_id"])
        new_assignee = await check_assignee(changes["assignee_id"])
        task.assignee_id = changes["assignee_id"]
        changed.append("assignee")
    if "asset_ids" in changes and changes["asset_ids"] is not None:
        new_ids = list(dict.fromkeys(changes["asset_ids"]))
        await check_assets([a for a in new_ids if a not in task.asset_ids], user)
        added = [a for a in new_ids if a not in task.asset_ids]
        if added:
            await log_task(task, user, f"added {len(added)} attachment{'s' if len(added) != 1 else ''}")
        if new_ids != task.asset_ids:
            task.asset_ids = new_ids
            changed.append("attachments")
    if changes.get("description") is not None:
        new_desc, new_html = _description(changes["description"], bool(changes.get("html")))
        if (new_desc, new_html) != (task.description, task.description_html):
            task.description, task.description_html = new_desc, new_html
            changed.append("description")
    for field, label in (("title", "title"), ("priority", "priority")):
        if changes.get(field) is not None and changes[field] != getattr(task, field):
            setattr(task, field, changes[field])
            changed.append(label)
    if "due_date" in changes and (changes["due_date"] or None) != task.due_date:
        await log_task(task, user, f"changed the due date from {task.due_date or 'none'} to {changes['due_date'] or 'none'}")
        task.due_date = changes["due_date"]
        task.last_reminded_on = None  # a new date may need a fresh reminder today
        changed.append("due date")

    await task.save()
    schedule_push([task.assignee_id, old_assignee])

    if task.assignee_id != old_assignee:
        previous = await User.get(old_assignee)
        await log_task(task, user, f"reassigned this task from {previous.name if previous else 'someone'} to {new_assignee.name}")
        await stop_timers(task_id=task.id, user_id=old_assignee)  # the old assignee's session ends with the handover
        await notify_task(
            [task.assignee_id], type="task_assigned", title=f"New task: {task.title}", body=f"Assigned by {user.name}.", task=task, actor=user
        )
        await notify_task(
            [old_assignee],
            type="task_unassigned",
            title=f"Task reassigned: {task.title}",
            body=f"{user.name} moved this task to someone else.",
            task=task,
            actor=user,
        )
    elif changed:
        await notify_task(
            [task.assignee_id],
            type="task_updated",
            title=f"Task updated: {task.title}",
            body=f"{user.name} changed the {', '.join(changed)}.",
            task=task,
            actor=user,
        )
    return await _one(task, user)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    task = await get_task_or_404(task_id)
    sub = await Subfolder.get(task.subfolder_id)
    require(user, "task.edit", sub, creator_id=task.created_by)
    await trash_task(task, user)
    schedule_push([task.assignee_id])
    await notify_task(
        [task.assignee_id],
        type="task_deleted",
        title=f"Task deleted: {task.title}",
        body=f"{user.name} deleted this task.",
        task=task,
        actor=user,
    )


# --- Progress and timer: the assignee only --------------------------------------------------------
async def _workable(task_id: PydanticObjectId, user: User) -> Task:
    task = await get_task_or_404(task_id)
    sub = await Subfolder.get(task.subfolder_id)
    require(user, "task.work", sub, target_id=task.assignee_id)
    if task.status not in OPEN_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This task is {task.status.replace('_', ' ')}")
    return task


@router.patch("/{task_id}/progress", response_model=TaskOut)
async def set_progress(task_id: PydanticObjectId, body: ProgressSet, user: User = Depends(get_current_user)) -> TaskOut:
    """The assignee sets 0-99. Approval is what takes a task to 100."""
    task = await _workable(task_id, user)
    if body.progress != task.progress:
        await log_task(task, user, f"changed progress from {task.progress}% to {body.progress}%")
    task.progress = body.progress
    if task.status == "todo" and body.progress > 0:
        task.status = "in_progress"
    await task.save()
    return await _one(task, user)


@router.post("/{task_id}/timer/start", response_model=TimerResult)
async def start_timer(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> TimerResult:
    """Start tracking time. A timer already running on another task is stopped first."""
    task = await _workable(task_id, user)

    already = await TimeLog.find_one(TimeLog.task_id == task.id, TimeLog.user_id == user.id, TimeLog.running == True)  # noqa: E712
    if already:
        raise HTTPException(status.HTTP_409_CONFLICT, "The timer is already running on this task")

    stopped = await stop_timers(user_id=user.id)
    try:
        await TimeLog(task_id=task.id, user_id=user.id, started_at=now_utc()).insert()
    except Exception:  # unique index: a second tab started one at the same moment
        raise HTTPException(status.HTTP_409_CONFLICT, "A timer is already running")
    if task.status == "todo":
        task.status = "in_progress"
        await task.save()
    task = await get_task_or_404(task.id)
    return TimerResult(task=await _one(task, user), stopped_task_id=stopped[0].task_id if stopped else None)


@router.post("/{task_id}/timer/stop", response_model=TaskOut)
async def stop_timer(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> TaskOut:
    task = await get_task_or_404(task_id)
    sub = await Subfolder.get(task.subfolder_id)
    require(user, "task.work", sub, target_id=task.assignee_id)  # allowed in any status: always let people stop
    stopped = await stop_timers(task_id=task.id, user_id=user.id)
    if not stopped:
        raise HTTPException(status.HTTP_409_CONFLICT, "The timer is not running on this task")
    return await _one(await get_task_or_404(task.id), user)


@router.get("/{task_id}/time-logs", response_model=list[TimeLogOut])
async def time_logs(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[TimeLog]:
    task = await get_task_or_404(task_id)
    await _viewable(task, user)
    return await TimeLog.find(TimeLog.task_id == task.id).sort("-started_at").to_list()


# --- Development helper ---------------------------------------------------------------------------------
if settings.ENVIRONMENT == "development":

    @router.post("/reminders/run", response_model=ReminderRun)
    async def run_reminders_now(
        today: date | None = Query(None, description="Pretend today is this date (YYYY-MM-DD)"),
        _: User = Depends(require_role("admin")),
    ) -> ReminderRun:
        """Dev only: run the daily reminder job right now."""
        day = today or today_local()
        return ReminderRun(day=day.isoformat(), sent=await run_reminders(day))
