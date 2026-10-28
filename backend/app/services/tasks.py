"""Helpers shared by the tasks router and the reminder job."""
from datetime import datetime, timezone
from typing import Iterable

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.permissions import can
from app.core.timeutil import as_utc
from app.models import File, Project, Subfolder, Task, TaskReview, TimeLog, User
from app.models import ChatGroup, ChatMessage
from app.models.task import OPEN_STATUSES
from app.schemas.file import FileOut
from app.schemas.task import TaskOut, TaskSource
from app.services import richtext
from app.services.activity import delete_activity, unresolved_counts
from app.services.chat import publish_message
from app.services.notify import notify
from app.services.projects import brief, load_users, unique
from app.services.storage import get_storage


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def link_for(user: User, task_id: PydanticObjectId, page: str | None = None) -> str:
    """Area-prefixed link: the task page, or `page` (e.g. "reviews") when given."""
    return f"{'/admin' if user.role == 'admin' else '/app'}/{page or f'tasks/{task_id}'}"


async def notify_task(
    user_ids: Iterable[PydanticObjectId], *, type: str, title: str, body: str, task: Task, actor: User | None, page: str | None = None
) -> None:
    """notify() with a link to the task that fits each recipient's area. The actor isn't told about their own action."""
    ids = [i for i in unique(user_ids) if not actor or i != actor.id]
    people = await load_users(ids)
    for person in people.values():
        if not person.is_active:
            continue
        await notify(
            [person.id], type=type, title=title, body=body, link=link_for(person, task.id, page), actor_id=actor.id if actor else None
        )


async def get_task_or_404(task_id: PydanticObjectId) -> Task:
    task = await Task.get(task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


async def check_assets(asset_ids: list[PydanticObjectId], user: User) -> None:
    """Attachments must exist and be the actor's own uploads/links (admins may attach any)."""
    ids = unique(asset_ids)
    if not ids:
        return
    found = {f.id: f for f in await File.find({"_id": {"$in": ids}}).to_list()}
    for fid in ids:
        f = found.get(fid)
        if f is None or (f.owner_id != user.id and user.role != "admin"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid attachment: upload the file or link first")


async def check_assignee(assignee_id: PydanticObjectId) -> User:
    person = await User.get(assignee_id)
    if person is None or not person.is_active or person.role not in ("admin", "employee"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The assignee must be an active team member")
    return person


async def copy_file(f: File, owner: User) -> File:
    """An independent copy of a file (own record, own stored bytes), so deleting the original can't take this one with it."""
    if f.kind == "link":
        copy = File(owner_id=owner.id, name=f.name, mime=f.mime, size=0, kind="link", url=f.url)
        return await copy.insert()
    storage = get_storage()
    with open(storage.get_path(f.storage_key), "rb") as source:
        stored = await storage.save(f.name, source, settings.MAX_UPLOAD_MB * 1024 * 1024)
    copy = File(owner_id=owner.id, name=f.name, mime=f.mime, size=stored.size, kind="upload", storage_key=stored.storage_key, url="")
    await copy.insert()
    copy.url = f"/api/v1/files/{copy.id}/download"
    return await copy.save()


# --- Timer ----------------------------------------------------------------------------------
async def stop_log(log: TimeLog, at: datetime | None = None) -> bool:
    """Close a running session and add it to the task total. False if someone else already did."""
    at = at or now_utc()
    seconds = max(0, int((at - as_utc(log.started_at)).total_seconds()))
    result = await TimeLog.find(TimeLog.id == log.id, TimeLog.running == True).update(  # noqa: E712
        {"$set": {"running": False, "ended_at": at, "seconds": seconds}}
    )
    if not result or result.modified_count != 1:
        return False
    await Task.find(Task.id == log.task_id).update({"$inc": {"total_seconds": seconds}})
    return True


async def stop_timers(*, task_id: PydanticObjectId | None = None, user_id: PydanticObjectId | None = None) -> list[TimeLog]:
    """Stop every running session matching the filter. Returns the sessions that were stopped."""
    filters = [TimeLog.running == True]  # noqa: E712
    if task_id:
        filters.append(TimeLog.task_id == task_id)
    if user_id:
        filters.append(TimeLog.user_id == user_id)
    stopped = []
    for log in await TimeLog.find(*filters).to_list():
        if await stop_log(log):
            stopped.append(log)
    return stopped


# --- Output ------------------------------------------------------------------------------------
async def task_outs(tasks: list[Task], viewer: User) -> list[TaskOut]:
    """Build API output for many tasks with a handful of queries instead of a few per task."""
    if not tasks:
        return []
    people = await load_users([i for t in tasks for i in (t.assignee_id, t.created_by)])
    files = {
        f.id: f for f in await File.find({"_id": {"$in": unique(a for t in tasks for a in t.asset_ids)}}).to_list()
    }
    subs = {s.id: s for s in await Subfolder.find({"_id": {"$in": unique(t.subfolder_id for t in tasks)}}).to_list()}
    projects = {p.id: p for p in await Project.find({"_id": {"$in": unique(t.project_id for t in tasks)}}).to_list()}
    running = {
        log.task_id: log
        for log in await TimeLog.find({"task_id": {"$in": [t.id for t in tasks]}, "running": True}).to_list()
    }

    reviews = await TaskReview.find({"task_id": {"$in": [t.id for t in tasks]}}).to_list()
    pending = {r.task_id: r for r in reviews if r.decision == "pending"}
    rounds: dict = {}
    for r in reviews:
        rounds[r.task_id] = rounds.get(r.task_id, 0) + 1

    unresolved = await unresolved_counts([t.id for t in tasks])
    groups = {
        g.id: g
        for g in await ChatGroup.find({"_id": {"$in": unique(t.source_group_id for t in tasks if t.source_group_id)}}).to_list()
    }

    now = now_utc()
    out = []
    for t in tasks:
        source_group = groups.get(t.source_group_id) if t.source_group_id else None
        log = running.get(t.id)
        sub = subs.get(t.subfolder_id)
        live = int((now - as_utc(log.started_at)).total_seconds()) if log else 0
        open_task = t.status in OPEN_STATUSES
        review = pending.get(t.id)
        out.append(
            TaskOut(
                id=t.id,
                project_id=t.project_id,
                project_name=projects[t.project_id].name if t.project_id in projects else "",
                subfolder_id=t.subfolder_id,
                subfolder_name=sub.name if sub else "",
                title=t.title,
                description=t.description,
                description_html=t.description_html,
                description_text=richtext.read(t.description)[0] if t.description_html else t.description,
                unresolved_changes=unresolved.get(t.id, 0),
                source=TaskSource(group_id=source_group.id, group_name=source_group.name, message_id=t.source_message_id)
                if source_group and t.source_message_id and can(viewer, "chat.member", source_group)
                else None,
                assignee=brief(people[t.assignee_id]) if t.assignee_id in people else None,
                created_by=brief(people[t.created_by]) if t.created_by in people else None,
                due_date=t.due_date,
                priority=t.priority,
                status=t.status,
                progress=t.progress,
                assets=[FileOut.model_validate(files[a], from_attributes=True) for a in t.asset_ids if a in files],
                total_seconds=t.total_seconds + max(0, live),
                timer_running=log is not None,
                timer_started_at=as_utc(log.started_at) if log else None,
                created_at=t.created_at,
                can_edit=can(viewer, "task.edit", sub, creator_id=t.created_by) and t.status != "approved",
                can_work=open_task and can(viewer, "task.work", sub, target_id=t.assignee_id),
                pending_review_id=review.id if review else None,
                can_review=bool(review) and can(viewer, "task.review", sub, approver_id=review.approver_id),
                review_rounds=rounds.get(t.id, 0),
            )
        )
    return out


# --- Deleting -----------------------------------------------------------------------------------
async def delete_tasks(tasks: list[Task]) -> None:
    """Remove tasks with their timer sessions and attachments."""
    if not tasks:
        return
    storage = get_storage()
    ids = [t.id for t in tasks]
    await TimeLog.find({"task_id": {"$in": ids}}).delete()
    reviews = await TaskReview.find({"task_id": {"$in": ids}}).to_list()
    for f in await File.find({"_id": {"$in": unique(x for r in reviews for x in r.file_ids)}}).to_list():
        if f.storage_key:
            await storage.delete(f.storage_key)
        await f.delete()
    await TaskReview.find({"task_id": {"$in": ids}}).delete()
    for f in await File.find({"_id": {"$in": unique(a for t in tasks for a in t.asset_ids)}}).to_list():
        if f.storage_key:
            await storage.delete(f.storage_key)
        await f.delete()
    await delete_activity(task_ids=ids)
    # Messages these tasks were made from lose their "Task created" chip.
    for msg in await ChatMessage.find({"task_id": {"$in": ids}}).to_list():
        await ChatMessage.find({"_id": msg.id}).update({"$set": {"task_id": None}})
        group = await ChatGroup.get(msg.group_id)
        if group:
            await publish_message(group, await ChatMessage.get(msg.id), "chat:message_update")
    await Task.find({"_id": {"$in": ids}}).delete()


async def delete_tasks_in_project(project_id: PydanticObjectId) -> None:
    await delete_tasks(await Task.find(Task.project_id == project_id).to_list())
