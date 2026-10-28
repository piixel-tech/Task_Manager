"""Soft delete: what an admin can bring back for 30 days.

Deleting a task, subfolder, project or chat message (for everyone) no longer destroys it. Its documents are copied whole
into a TrashItem and removed from the live collections, so every existing query keeps working untouched; its files stay on
disk. Restoring puts the same documents back with the same ids. After 30 days the item is purged for good (files included).
"""
from datetime import datetime, timezone
from typing import Any

from beanie import PydanticObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.models import (
    ChatGroup,
    ChatMessage,
    ChecklistItem,
    DeliverablePlan,
    Project,
    Requirement,
    Subfolder,
    Task,
    TaskActivity,
    TaskReview,
    TimeLog,
    TrashItem,
    User,
)
from app.services.chat import drop_file_if_unused, publish_message
from app.services.checklist import delete_files

# payload key -> model, in the order they are put back (parents before children)
_ORDER: list[tuple[str, Any]] = [
    ("projects", Project),
    ("subfolders", Subfolder),
    ("requirements", Requirement),
    ("checklist_items", ChecklistItem),
    ("deliverable_plans", DeliverablePlan),
    ("tasks", Task),
    ("time_logs", TimeLog),
    ("task_reviews", TaskReview),
    ("task_activity", TaskActivity),
]
_MODELS = dict(_ORDER)


async def _raw(model: Any, query: dict) -> list[dict]:
    return await model.get_motor_collection().find(query).to_list(None)


async def _drop(model: Any, query: dict) -> None:
    await model.get_motor_collection().delete_many(query)


def _merge(into: dict, other: dict) -> dict:
    for key, value in other.items():
        into.setdefault(key, [])
        into[key].extend(v for v in value if v not in into[key])
    return into


def _files_of(payload: dict) -> list[PydanticObjectId]:
    ids: list[PydanticObjectId] = []
    for t in payload.get("tasks", []):
        ids += t.get("asset_ids", [])
    for key in ("task_reviews", "task_activity"):
        for d in payload.get(key, []):
            ids += d.get("file_ids", [])
    for d in payload.get("checklist_items", []):
        ids += d.get("attachment_ids", [])
    for d in payload.get("requirements", []):
        ids += d.get("attachment_ids", [])
        for v in d.get("history", []):
            ids += v.get("attachment_ids", [])
    return list(dict.fromkeys(ids))


# --- Collecting ----------------------------------------------------------------------------------------------------
async def _task_bundle(task_ids: list[PydanticObjectId]) -> dict:
    bundle = {
        "tasks": await _raw(Task, {"_id": {"$in": task_ids}}),
        "time_logs": await _raw(TimeLog, {"task_id": {"$in": task_ids}}),
        "task_reviews": await _raw(TaskReview, {"task_id": {"$in": task_ids}}),
        "task_activity": await _raw(TaskActivity, {"task_id": {"$in": task_ids}}),
    }
    bundle["chat_task_links"] = [
        {"message": m["_id"], "task": m["task_id"]} for m in await _raw(ChatMessage, {"task_id": {"$in": task_ids}})
    ]
    return bundle


async def _subfolder_bundle(sub_ids: list[PydanticObjectId]) -> dict:
    tasks = await _raw(Task, {"subfolder_id": {"$in": sub_ids}})
    bundle = await _task_bundle([t["_id"] for t in tasks])
    bundle["subfolders"] = await _raw(Subfolder, {"_id": {"$in": sub_ids}})
    bundle["checklist_items"] = await _raw(ChecklistItem, {"subfolder_id": {"$in": sub_ids}})
    bundle["deliverable_plans"] = await _raw(DeliverablePlan, {"subfolder_id": {"$in": sub_ids}})
    bundle["task_activity"] += await _raw(TaskActivity, {"subfolder_id": {"$in": sub_ids}, "task_id": None})
    bundle["requirement_tags"] = [
        {"requirement": r["_id"], "subfolder": r["subfolder_id"]} for r in await _raw(Requirement, {"subfolder_id": {"$in": sub_ids}})
    ]
    bundle["group_links"] = [
        {"group": g["_id"], "subfolder": g["subfolder_id"]} for g in await _raw(ChatGroup, {"subfolder_id": {"$in": sub_ids}})
    ]
    return bundle


async def _remove_task_docs(task_ids: list[PydanticObjectId]) -> None:
    for msg in await ChatMessage.find({"task_id": {"$in": task_ids}}).to_list():  # their "Task created" chip goes away
        await ChatMessage.find({"_id": msg.id}).update({"$set": {"task_id": None}})
        group = await ChatGroup.get(msg.group_id)
        if group:
            await publish_message(group, await ChatMessage.get(msg.id), "chat:message_update")
    await _drop(TimeLog, {"task_id": {"$in": task_ids}})
    await _drop(TaskReview, {"task_id": {"$in": task_ids}})
    await _drop(TaskActivity, {"task_id": {"$in": task_ids}})
    await _drop(Task, {"_id": {"$in": task_ids}})


async def _remove_subfolder_docs(sub_ids: list[PydanticObjectId]) -> None:
    await _remove_task_docs([t.id for t in await Task.find({"subfolder_id": {"$in": sub_ids}}).to_list()])
    await _drop(ChecklistItem, {"subfolder_id": {"$in": sub_ids}})
    await _drop(DeliverablePlan, {"subfolder_id": {"$in": sub_ids}})
    await _drop(TaskActivity, {"subfolder_id": {"$in": sub_ids}})
    await Requirement.find({"subfolder_id": {"$in": sub_ids}}).update({"$set": {"subfolder_id": None}})  # keep what the client asked for
    await ChatGroup.find({"subfolder_id": {"$in": sub_ids}}).update({"$set": {"subfolder_id": None}})
    await _drop(Subfolder, {"_id": {"$in": sub_ids}})


async def _names(project_id: PydanticObjectId, subfolder_id: PydanticObjectId | None = None) -> str:
    project = await Project.get(project_id)
    sub = await Subfolder.get(subfolder_id) if subfolder_id else None
    return " › ".join(n for n in (project.name if project else "", sub.name if sub else "") if n)


# --- Moving things to the trash ------------------------------------------------------------------------------------------
async def trash_task(task: Task, actor: User) -> TrashItem:
    payload = await _task_bundle([task.id])
    item = await TrashItem(
        kind="task",
        title=task.title,
        context=await _names(task.project_id, task.subfolder_id),
        original_id=task.id,
        deleted_by=actor.id,
        payload=payload,
        file_ids=_files_of(payload),
    ).insert()
    await _remove_task_docs([task.id])
    return item


async def trash_subfolder(sub: Subfolder, actor: User) -> TrashItem:
    payload = await _subfolder_bundle([sub.id])
    item = await TrashItem(
        kind="subfolder",
        title=sub.name,
        context=await _names(sub.project_id),
        original_id=sub.id,
        deleted_by=actor.id,
        payload=payload,
        file_ids=_files_of(payload),
    ).insert()
    await _remove_subfolder_docs([sub.id])
    return item


async def trash_project(project: Project, actor: User) -> TrashItem:
    sub_ids = [s["_id"] for s in await _raw(Subfolder, {"project_id": project.id})]
    payload = await _subfolder_bundle(sub_ids)
    payload["projects"] = await _raw(Project, {"_id": project.id})
    payload["requirements"] = await _raw(Requirement, {"project_id": project.id})
    item = await TrashItem(
        kind="project",
        title=project.name,
        original_id=project.id,
        deleted_by=actor.id,
        payload=payload,
        file_ids=_files_of(payload),
    ).insert()
    await _remove_subfolder_docs(sub_ids)
    await _drop(Requirement, {"project_id": project.id})
    await _drop(Project, {"_id": project.id})
    return item


async def trash_message(msg: ChatMessage, actor: User, context: str = "") -> TrashItem:
    """Called just before a message is blanked for everyone: the original text and file stay here."""
    raw = (await _raw(ChatMessage, {"_id": msg.id}))[0]
    text = msg.text if msg.html else msg.body
    return await TrashItem(
        kind="message",
        title=(text or (msg.type.title() if msg.type != "text" else "Message"))[:120],
        context=context,
        original_id=msg.id,
        deleted_by=actor.id,
        payload={"message": raw},
    ).insert()


# --- Bringing things back ---------------------------------------------------------------------------------------------------
async def _put_back(payload: dict) -> int:
    """Insert the saved documents (skipping any that already exist). Returns how many went back."""
    count = 0
    for key, model in _ORDER:
        docs = payload.get(key) or []
        if not docs:
            continue
        existing = {d["_id"] for d in await _raw(model, {"_id": {"$in": [d["_id"] for d in docs]}})}
        fresh = [d for d in docs if d["_id"] not in existing]
        if key == "time_logs":  # a timer can't go on running after a restore
            for d in fresh:
                if d.get("running"):
                    d["running"], d["ended_at"] = False, d.get("ended_at") or datetime.now(timezone.utc)
        for d in fresh:
            try:
                await model.get_motor_collection().insert_one(d)
                count += 1
            except DuplicateKeyError:
                continue  # e.g. a deliverables plan that was recreated for the same month in the meantime
    return count


async def _relink(payload: dict) -> None:
    for link in payload.get("requirement_tags", []):
        await Requirement.find({"_id": link["requirement"], "subfolder_id": None}).update({"$set": {"subfolder_id": link["subfolder"]}})
    for link in payload.get("group_links", []):
        await ChatGroup.find({"_id": link["group"], "subfolder_id": None}).update({"$set": {"subfolder_id": link["subfolder"]}})
    for link in payload.get("chat_task_links", []):
        msg = await ChatMessage.find_one({"_id": link["message"], "task_id": None})
        if msg and await Task.get(link["task"]):
            await ChatMessage.find({"_id": msg.id}).update({"$set": {"task_id": link["task"]}})
            group = await ChatGroup.get(msg.group_id)
            if group:
                await publish_message(group, await ChatMessage.get(msg.id), "chat:message_update")


async def restore(item: TrashItem) -> str:
    """Put it back. Returns a short description of what returned. Raises 409 when what it lived in is gone."""
    p = item.payload
    if item.kind == "message":
        raw = p["message"]
        msg = await ChatMessage.get(raw["_id"])
        group = await ChatGroup.get(raw["group_id"])
        if group is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "The chat group this message was in no longer exists")
        if msg is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "The message is gone")
        keep = ("body", "html", "text", "mentions", "links", "file_id", "file_kind", "duration", "reply_to", "reactions", "task_id")
        await ChatMessage.find({"_id": msg.id}).update({"$set": {**{k: raw[k] for k in keep if k in raw}, "deleted_for_all": False}})
        await publish_message(group, await ChatMessage.get(msg.id), "chat:message_update")
        await item.delete()
        return "message"

    if item.kind == "task":
        task = p["tasks"][0]
        if await Subfolder.get(task["subfolder_id"]) is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Restore its subfolder (or project) first: the task has nowhere to go")
        if await Task.get(task["_id"]):
            raise HTTPException(status.HTTP_409_CONFLICT, "This task is already back")
    elif item.kind == "subfolder":
        sub = p["subfolders"][0]
        if await Project.get(sub["project_id"]) is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Restore its project first: the subfolder has nowhere to go")
        if await Subfolder.get(sub["_id"]):
            raise HTTPException(status.HTTP_409_CONFLICT, "This subfolder is already back")
    elif await Project.get(p["projects"][0]["_id"]):
        raise HTTPException(status.HTTP_409_CONFLICT, "This project is already back")

    await _put_back(p)
    await _relink(p)
    await item.delete()
    return item.kind


# --- Purging ---------------------------------------------------------------------------------------------------------------------
async def purge(item: TrashItem) -> None:
    """Forget it for good: its files go too."""
    if item.kind == "message":
        await drop_file_if_unused((item.payload.get("message") or {}).get("file_id"), ignore_trash=item.id)
    else:
        await delete_files(item.file_ids)
    await item.delete()


async def purge_expired(now: datetime | None = None) -> int:
    """The daily clean-up: everything past its 30 days."""
    due = await TrashItem.find({"expires_at": {"$lte": now or datetime.now(timezone.utc)}}).to_list()
    for item in due:
        await purge(item)
    return len(due)


async def purge_group_messages(group_id: PydanticObjectId) -> None:
    """A chat group was deleted for good: so are its messages waiting in the trash."""
    for item in await TrashItem.find({"kind": "message", "payload.message.group_id": group_id}).to_list():
        await purge(item)

