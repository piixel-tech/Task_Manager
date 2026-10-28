"""Task Activity panel and subfolder Mid-way changes: building output, notifying people, and the automatic log."""
from typing import Iterable

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.permissions import can
from app.core.timeutil import as_utc
from app.models import File, Subfolder, Task, TaskActivity, User
from app.models.office import REACTIONS
from app.schemas.activity import ActivityOut, ReactionOut
from app.schemas.file import FileOut
from app.services import richtext
from app.services.checklist import delete_files
from app.services.notify import notify
from app.services.projects import brief, load_users, subfolders_of, unique


def area(user: User) -> str:
    return "/admin" if user.role == "admin" else "/app"


def task_link(person: User, task_id: PydanticObjectId, activity_id: PydanticObjectId | None = None) -> str:
    return f"{area(person)}/tasks/{task_id}?tab=activity" + (f"&entry={activity_id}" if activity_id else "")


def subfolder_link(person: User, sub: Subfolder, activity_id: PydanticObjectId | None = None) -> str:
    return f"{area(person)}/projects/{sub.project_id}/subfolders/{sub.id}" + (f"?entry={activity_id}" if activity_id else "")


# --- Clean input ---------------------------------------------------------------------------------------------------
def clean(body: str, file_ids: list, *, label: str) -> tuple[str, str, list[PydanticObjectId]]:
    """(sanitized HTML, plain text, mentioned ids). Needs some text or a file."""
    html = richtext.sanitize(body) if body else ""
    text, mentions, _ = richtext.read(html)
    if not text and not file_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Write something or attach a file to your {label}")
    return (html if text else ""), text, mentions


# --- Output ----------------------------------------------------------------------------------------------------------
async def activity_outs(rows: list[TaskActivity], viewer: User, sub: Subfolder, task: Task | None) -> list[ActivityOut]:
    files = {f.id: f for f in await File.find({"_id": {"$in": unique(i for r in rows for i in r.file_ids)}}).to_list()}
    people = await load_users(
        [r.author_id for r in rows] + [r.assigned_to for r in rows if r.assigned_to] + [r.resolved_by for r in rows if r.resolved_by]
    )
    who = lambda uid: brief(people[uid]) if uid in people else None  # noqa: E731
    out = []
    for r in rows:
        if r.kind == "change_request":  # the task's assignee and the heads tick these
            ok = can(viewer, "activity.resolve", sub, target_id=task.assignee_id if task else None)
        else:
            ok = can(viewer, "activity.resolve", sub, creator_id=r.author_id, assigned_id=r.assigned_to)
        out.append(
            ActivityOut(
                id=r.id,
                task_id=r.task_id,
                subfolder_id=r.subfolder_id,
                kind=r.kind,
                body=r.body,
                text=r.text,
                files=[FileOut.model_validate(files[i], from_attributes=True) for i in r.file_ids if i in files],
                author=who(r.author_id),
                mentions=r.mentions,
                assigned_to=who(r.assigned_to) if r.assigned_to else None,
                resolved=r.resolved,
                resolved_by=who(r.resolved_by) if r.resolved_by else None,
                resolved_at=as_utc(r.resolved_at) if r.resolved_at else None,
                reactions=[ReactionOut(emoji=e, user_ids=r.reactions[e]) for e in REACTIONS if r.reactions.get(e)],
                parent_id=r.parent_id,
                created_at=as_utc(r.created_at),
                can_resolve=ok and r.kind != "log" and r.parent_id is None,
                can_delete=r.kind != "log" and can(viewer, "activity.delete", sub, creator_id=r.author_id),
            )
        )
    return out


async def unresolved_counts(task_ids: list[PydanticObjectId]) -> dict[PydanticObjectId, int]:
    """Open mid-way changes per task, for the badge on task cards."""
    if not task_ids:
        return {}
    rows = await TaskActivity.get_motor_collection().aggregate(
        [
            {"$match": {"task_id": {"$in": task_ids}, "kind": "change_request", "parent_id": None, "resolved": False}},
            {"$group": {"_id": "$task_id", "n": {"$sum": 1}}},
        ]
    ).to_list(None)
    return {r["_id"]: r["n"] for r in rows}


# --- Who may be mentioned or assigned -----------------------------------------------------------------------------
async def people_who_can_see(person_ids: Iterable[PydanticObjectId], sub: Subfolder, task: Task | None) -> dict[PydanticObjectId, User]:
    """Of these people, the active team members who can see this task (or subfolder)."""
    people = await load_users(unique(person_ids))
    siblings = await subfolders_of(sub.project_id)
    out = {}
    for pid, p in people.items():
        if not p.is_active:
            continue
        seen = can(p, "task.view", sub, siblings=siblings, target_id=task.assignee_id) if task else can(p, "subfolder.view", sub, siblings=siblings)
        if seen:
            out[pid] = p
    return out


async def tell(
    ids: Iterable[PydanticObjectId], actor: User, *, type: str, title: str, body: str, sub: Subfolder, task: Task | None, entry: PydanticObjectId
) -> None:
    """notify() with a link into the panel that suits each person's area. The actor isn't told about their own action."""
    people = await load_users([i for i in unique(ids) if i != actor.id])
    for p in people.values():
        if p.is_active:
            link = task_link(p, task.id, entry) if task else subfolder_link(p, sub, entry)
            await notify([p.id], type=type, title=title, body=body[:140], link=link, actor_id=actor.id)


# --- Automatic log ------------------------------------------------------------------------------------------------------
async def log_task(task: Task, actor: User, text: str) -> None:
    """One line in the task's Activity log, e.g. "changed the due date from X to Y". A failure here never breaks the action itself."""
    try:
        await TaskActivity(
            task_id=task.id, subfolder_id=task.subfolder_id, project_id=task.project_id, kind="log", body=text, text=text, author_id=actor.id
        ).insert()
    except Exception:  # noqa: BLE001
        pass


# --- Cleanup ---------------------------------------------------------------------------------------------------------------
async def delete_activity(*, task_ids: list[PydanticObjectId] | None = None, subfolder_ids: list[PydanticObjectId] | None = None) -> None:
    """Remove entries (and their files) when their task or subfolder goes away."""
    query = {"task_id": {"$in": task_ids}} if task_ids else {"subfolder_id": {"$in": subfolder_ids or []}}
    rows = await TaskActivity.find(query).to_list()
    await delete_files([i for r in rows for i in r.file_ids])
    await TaskActivity.find(query).delete()
