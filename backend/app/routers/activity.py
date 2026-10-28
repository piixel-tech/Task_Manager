"""Task Activity panel (mid-way changes, comments, log) and the subfolder-level Mid-way changes box."""
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import Subfolder, Task, TaskActivity, User
from app.models.office import REACTIONS
from app.schemas.activity import ActivityCreate, ActivityList, ActivityOut, ReactionToggle, ResolvedSet
from app.services.activity import (
    activity_outs,
    clean,
    people_who_can_see,
    tell,
    unresolved_counts,
)
from app.services.checklist import delete_files
from app.services.projects import get_subfolder_or_404, subfolders_of, unique
from app.services.tasks import check_assets, get_task_or_404

router = APIRouter(tags=["activity"])

LIST_LIMIT = 500


# --- Scope: a task, or a subfolder on its own ------------------------------------------------------------------------
async def _task_scope(task_id: PydanticObjectId, user: User) -> tuple[Subfolder, Task]:
    task = await get_task_or_404(task_id)
    sub = await get_subfolder_or_404(task.subfolder_id)
    require(user, "task.view", sub, siblings=await subfolders_of(task.project_id), target_id=task.assignee_id)
    return sub, task


async def _sub_scope(subfolder_id: PydanticObjectId, user: User) -> Subfolder:
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "subfolder.view", sub, siblings=await subfolders_of(sub.project_id))
    return sub


async def _entry_scope(entry_id: PydanticObjectId, user: User) -> tuple[TaskActivity, Subfolder, Task | None]:
    row = await TaskActivity.get(entry_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    if row.task_id:
        sub, task = await _task_scope(row.task_id, user)
        return row, sub, task
    return row, await _sub_scope(row.subfolder_id, user), None


async def _one(row: TaskActivity, user: User, sub: Subfolder, task: Task | None) -> ActivityOut:
    return (await activity_outs([row], user, sub, task))[0]


# --- Reading ----------------------------------------------------------------------------------------------------------------
@router.get("/tasks/{task_id}/activity", response_model=ActivityList)
async def task_activity(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> ActivityList:
    """Everything on the task's Activity panel, oldest first: mid-way changes, comments and the automatic log."""
    sub, task = await _task_scope(task_id, user)
    rows = await TaskActivity.find({"task_id": task.id}).sort("+created_at").limit(LIST_LIMIT).to_list()
    return ActivityList(items=await activity_outs(rows, user, sub, task), unresolved=(await unresolved_counts([task.id])).get(task.id, 0))


@router.get("/subfolders/{subfolder_id}/changes", response_model=ActivityList)
async def subfolder_changes(
    subfolder_id: PydanticObjectId, open_only: bool = Query(False), user: User = Depends(get_current_user)
) -> ActivityList:
    """The subfolder's own Mid-way changes (not tied to one task), oldest first."""
    sub = await _sub_scope(subfolder_id, user)
    query: dict = {"subfolder_id": sub.id, "task_id": None, "kind": "change_request"}
    rows = await TaskActivity.find(query).sort("+created_at").limit(LIST_LIMIT).to_list()
    open_ids = {r.id for r in rows if r.parent_id is None and not r.resolved}
    if open_only:
        rows = [r for r in rows if r.id in open_ids or (r.parent_id in open_ids)]
    return ActivityList(items=await activity_outs(rows, user, sub, None), unresolved=len(open_ids))


# --- Posting ------------------------------------------------------------------------------------------------------------------
async def _create(body: ActivityCreate, user: User, sub: Subfolder, task: Task | None) -> ActivityOut:
    kind = body.kind
    parent = None
    if body.parent_id:
        parent = await TaskActivity.get(body.parent_id)
        same_place = parent is not None and parent.task_id == (task.id if task else None) and parent.subfolder_id == sub.id
        if not same_place or parent.kind == "log" or parent.parent_id is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You can only reply to a mid-way change or comment")
        kind = parent.kind
    if task is None and kind != "change_request":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only mid-way changes can be posted here")
    if body.assigned_to and (kind != "comment" or parent is not None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only a new comment can be assigned to someone")

    await check_assets(body.file_ids, user)
    html, text, mentions = clean(body.body, body.file_ids, label="mid-way change" if kind == "change_request" else "comment")
    visible = await people_who_can_see([*mentions, *([body.assigned_to] if body.assigned_to else [])], sub, task)
    if body.assigned_to and body.assigned_to not in visible:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Assign it to someone who can see this task")
    mentions = [m for m in mentions if m in visible and m != user.id]

    row = await TaskActivity(
        task_id=task.id if task else None,
        subfolder_id=sub.id,
        project_id=sub.project_id,
        kind=kind,
        body=html,
        text=text,
        file_ids=unique(body.file_ids),
        author_id=user.id,
        mentions=mentions,
        assigned_to=body.assigned_to,
        parent_id=parent.id if parent else None,
    ).insert()

    where = f"“{task.title}”" if task else f"{sub.name}"
    told: set[PydanticObjectId] = set()

    async def say(ids, type_, title):
        ids = [i for i in unique(ids) if i not in told]
        told.update(ids)
        await tell(ids, user, type=type_, title=title, body=text, sub=sub, task=task, entry=row.id)

    await say(mentions, "mention", f"{user.name} mentioned you on {where}")
    if body.assigned_to:
        await say([body.assigned_to], "activity_assigned", f"{user.name} assigned you a comment on {where}")
    if parent:
        await say([parent.author_id], "activity_reply", f"{user.name} replied on {where}")
    elif kind == "change_request":
        await say([*( [task.assignee_id] if task else [] ), *sub.head_ids], "change_request", f"New mid-way change on {where}")
    elif task:
        await say([task.assignee_id], "task_comment", f"New comment on {where}")
    return await _one(row, user, sub, task)


@router.post("/tasks/{task_id}/activity", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def post_task_activity(task_id: PydanticObjectId, body: ActivityCreate, user: User = Depends(get_current_user)) -> ActivityOut:
    """Anyone who can see the task posts a mid-way change or a comment (or replies to one)."""
    sub, task = await _task_scope(task_id, user)
    return await _create(body, user, sub, task)


@router.post("/subfolders/{subfolder_id}/changes", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
async def post_subfolder_change(subfolder_id: PydanticObjectId, body: ActivityCreate, user: User = Depends(get_current_user)) -> ActivityOut:
    sub = await _sub_scope(subfolder_id, user)
    return await _create(body, user, sub, None)


# --- Resolving, reacting, deleting ---------------------------------------------------------------------------------------------
@router.put("/activity/{entry_id}/resolved", response_model=ActivityOut)
async def set_resolved(entry_id: PydanticObjectId, body: ResolvedSet, user: User = Depends(get_current_user)) -> ActivityOut:
    """Tick (or untick) a mid-way change or comment. Heads, admins, the task's assignee, or whoever a comment is assigned to."""
    row, sub, task = await _entry_scope(entry_id, user)
    if row.kind == "log" or row.parent_id is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only a mid-way change or comment can be resolved")
    if row.kind == "change_request":
        require(user, "activity.resolve", sub, target_id=task.assignee_id if task else None)
    else:
        require(user, "activity.resolve", sub, creator_id=row.author_id, assigned_id=row.assigned_to)
    if row.resolved != body.resolved:
        row.resolved = body.resolved
        row.resolved_by = user.id if body.resolved else None
        row.resolved_at = datetime.now(timezone.utc) if body.resolved else None
        await row.save()
        where = f"“{task.title}”" if task else sub.name
        word = "resolved" if body.resolved else "reopened"
        await tell([row.author_id], user, type="activity_resolved", title=f"{user.name} {word} your {'mid-way change' if row.kind == 'change_request' else 'comment'}", body=where, sub=sub, task=task, entry=row.id)
    return await _one(row, user, sub, task)


@router.put("/activity/{entry_id}/reactions", response_model=ActivityOut)
async def toggle_reaction(entry_id: PydanticObjectId, body: ReactionToggle, user: User = Depends(get_current_user)) -> ActivityOut:
    row, sub, task = await _entry_scope(entry_id, user)
    if row.kind == "log":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Log lines can't be reacted to")
    if body.emoji not in REACTIONS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Pick one of {' '.join(REACTIONS)}")
    op = "$pull" if user.id in row.reactions.get(body.emoji, []) else "$addToSet"
    await TaskActivity.find({"_id": row.id}).update({op: {f"reactions.{body.emoji}": user.id}})
    return await _one(await TaskActivity.get(row.id), user, sub, task)


@router.delete("/activity/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Remove your own mid-way change or comment (admins can remove any). Its replies and files go with it."""
    row, sub, _ = await _entry_scope(entry_id, user)
    if row.kind == "log":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The activity log can't be edited")
    require(user, "activity.delete", sub, creator_id=row.author_id)
    replies = await TaskActivity.find({"parent_id": row.id}).to_list()
    await delete_files([*row.file_ids, *(i for r in replies for i in r.file_ids)])
    await TaskActivity.find({"parent_id": row.id}).delete()
    await row.delete()

