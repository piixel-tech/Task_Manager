"""Chat upgrades: search, shared media / docs / links, pinned messages and scheduled messages."""
import asyncio
import re
from datetime import date, datetime, time, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.timeutil import as_utc, tz
from app.models import File, User
from app.models.chat import ChatGroup, ChatMessage, Pin, ScheduledMessage
from app.schemas.chat import (
    LinkItem,
    LinkPage,
    MessageOut,
    PinOut,
    ScheduledCreate,
    ScheduledOut,
    ScheduledUpdate,
    SearchHit,
    SearchPage,
    SharedPage,
)
from app.schemas.file import FileOut
from app.services import richtext
from app.services.chat import (
    check_attachment,
    compose,
    everyone,
    groups_of,
    member_group,
    message_outs,
    publish,
)
from app.services.checklist import delete_files
from app.services.link_preview import fetch_title
from app.services.projects import brief, load_users

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_PINS = 10
PAGE = 20
MAX_AHEAD = timedelta(days=365)
MIN_AHEAD = timedelta(seconds=30)


# --- Search ---------------------------------------------------------------------------------------------------------------
def _day_start(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=tz()).astimezone(timezone.utc)


@router.get("/search", response_model=SearchPage)
async def search(
    q: str = Query("", max_length=100, description="Words to look for in the text"),
    group_id: PydanticObjectId | None = Query(None, description="Only this group"),
    sender_id: PydanticObjectId | None = None,
    date_from: date | None = None,
    date_to: date | None = Query(None, description="Inclusive"),
    mentions_me: bool = Query(False, description="Only messages that @mention you"),
    before: PydanticObjectId | None = Query(None, description="Older than this message id (next page)"),
    limit: int = Query(PAGE, ge=1, le=50),
    user: User = Depends(get_current_user),
) -> SearchPage:
    """Messages in the groups you are in. Everything given must match; with nothing given you get the newest messages."""
    require(user, "chat.list")
    groups = {g.id: g for g in await ChatGroup.find(groups_of(user)).to_list()}
    if group_id:
        await member_group(group_id, user)  # 403 / 404 rather than an empty list for someone else's group
        groups = {group_id: groups[group_id]}

    query: dict = {"group_id": {"$in": list(groups)}, "deleted_for": {"$ne": user.id}, "deleted_for_all": False}
    if q.strip():
        words = [re.compile(re.escape(w), re.IGNORECASE) for w in q.split()]
        # Rich messages keep their plain text in `text`; older plain ones are searched through `body`.
        query["$and"] = [{"$or": [{"text": w}, {"html": {"$ne": True}, "body": w}]} for w in words]
    if sender_id:
        query["sender_id"] = sender_id
    if mentions_me:
        query["mentions"] = user.id
    if date_from or date_to:
        span: dict = {}
        if date_from:
            span["$gte"] = _day_start(date_from)
        if date_to:
            span["$lt"] = _day_start(date_to + timedelta(days=1))
        query["created_at"] = span
    if before:
        query["_id"] = {"$lt": before}

    rows = await ChatMessage.find(query).sort("-_id").limit(limit + 1).to_list()
    more = len(rows) > limit
    rows = rows[:limit]
    outs = await message_outs(rows, groups)
    return SearchPage(items=[SearchHit(group_id=o.group_id, group_name=groups[o.group_id].name, message=o) for o in outs], has_more=more)


# --- Media, docs, links -----------------------------------------------------------------------------------------------------
async def _shared_query(group: ChatGroup, user: User, extra: dict) -> dict:
    return {"group_id": group.id, "deleted_for": {"$ne": user.id}, "deleted_for_all": False, **extra}


@router.get("/groups/{group_id}/shared", response_model=SharedPage)
async def shared(
    group_id: PydanticObjectId,
    kind: str = Query(..., pattern="^(media|docs)$"),
    before: PydanticObjectId | None = None,
    limit: int = Query(PAGE, ge=1, le=60),
    user: User = Depends(get_current_user),
) -> SharedPage:
    """Photos and videos (`media`) or other files (`docs`) sent in the group, newest first."""
    group = await member_group(group_id, user)
    kinds = (
        {"$or": [{"type": "image"}, {"type": "file", "file_kind": "media"}]}
        if kind == "media"
        else {"type": "file", "file_kind": {"$ne": "media"}}
    )
    query = await _shared_query(group, user, kinds)
    if before:
        query["_id"] = {"$lt": before}
    rows = await ChatMessage.find(query).sort("-_id").limit(limit + 1).to_list()
    return SharedPage(items=await message_outs(rows[:limit], {group.id: group}), has_more=len(rows) > limit)


async def _titles(messages: list[ChatMessage]) -> None:
    """Look up the title of every link not seen before, a few at a time, and remember it on the message."""
    todo = [(m, link) for m in messages for link in m.links if not link.checked][:15]
    if not todo:
        return
    found = await asyncio.gather(*(fetch_title(link.url) for _, link in todo))
    for (_, link), title in zip(todo, found):
        link.title, link.checked = title, True
    for m in {id(m): m for m, _ in todo}.values():
        await ChatMessage.find({"_id": m.id}).update({"$set": {"links": [link.model_dump() for link in m.links]}})


@router.get("/groups/{group_id}/links", response_model=LinkPage)
async def links(
    group_id: PydanticObjectId,
    before: PydanticObjectId | None = None,
    limit: int = Query(PAGE, ge=1, le=60),
    user: User = Depends(get_current_user),
) -> LinkPage:
    """Web addresses found in the group's messages, newest first, with the page title when there is one."""
    group = await member_group(group_id, user)
    query = await _shared_query(group, user, {"links.0": {"$exists": True}})
    if before:
        query["_id"] = {"$lt": before}
    rows = await ChatMessage.find(query).sort("-_id").limit(limit + 1).to_list()
    more = len(rows) > limit
    rows = rows[:limit]
    await _titles(rows)
    people = await load_users(m.sender_id for m in rows)
    items = [
        LinkItem(
            url=link.url,
            title=link.title,
            message_id=m.id,
            sender=brief(people[m.sender_id]) if m.sender_id in people else None,
            created_at=as_utc(m.created_at),
        )
        for m in rows
        for link in m.links
    ]
    return LinkPage(items=items, has_more=more, next_before=rows[-1].id if more else None)


# --- Pinned messages ----------------------------------------------------------------------------------------------------------
async def _pin_target(message_id: PydanticObjectId, user: User) -> tuple[ChatMessage, ChatGroup]:
    msg = await ChatMessage.get(message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    group = await member_group(msg.group_id, user)
    if user.id in msg.deleted_for:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    require(user, "chat.pin", group)
    return msg, group


async def _group_changed(group: ChatGroup) -> None:
    await publish(everyone(group), "chat:group", {"group_id": str(group.id)})


@router.get("/groups/{group_id}/pins", response_model=list[PinOut])
async def pins(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[PinOut]:
    """The group's pinned messages, most recently pinned first."""
    group = await member_group(group_id, user)
    by_message = {p.message_id: p for p in group.pins}
    rows = await ChatMessage.find(
        {"_id": {"$in": list(by_message)}, "deleted_for": {"$ne": user.id}, "deleted_for_all": False}
    ).to_list()
    outs = {o.id: o for o in await message_outs(rows, {group.id: group})}
    people = await load_users(p.pinned_by for p in group.pins)
    return [
        PinOut(message=outs[p.message_id], pinned_by=brief(people[p.pinned_by]) if p.pinned_by in people else None, pinned_at=as_utc(p.pinned_at))
        for p in reversed(group.pins)
        if p.message_id in outs
    ]


@router.put("/messages/{message_id}/pin", response_model=MessageOut)
async def pin(message_id: PydanticObjectId, user: User = Depends(get_current_user)) -> MessageOut:
    msg, group = await _pin_target(message_id, user)
    if msg.deleted_for_all:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    if not any(p.message_id == msg.id for p in group.pins):
        if len(group.pins) >= MAX_PINS:
            raise HTTPException(status.HTTP_409_CONFLICT, f"A group can have {MAX_PINS} pinned messages. Unpin one first.")
        await ChatGroup.find({"_id": group.id, "pins.message_id": {"$ne": msg.id}}).update(
            {"$push": {"pins": Pin(message_id=msg.id, pinned_by=user.id).model_dump()}}
        )
        await _group_changed(group)
    return (await message_outs([msg], {group.id: group}))[0]


@router.delete("/messages/{message_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin(message_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    msg, group = await _pin_target(message_id, user)
    if any(p.message_id == msg.id for p in group.pins):
        await ChatGroup.find({"_id": group.id}).update({"$pull": {"pins": {"message_id": msg.id}}})
        await _group_changed(group)


# --- Scheduled messages ------------------------------------------------------------------------------------------------------
async def _check_when(send_at: datetime) -> datetime:
    when, now = as_utc(send_at), datetime.now(timezone.utc)
    if when < now + MIN_AHEAD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a time in the future")
    if when > now + MAX_AHEAD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Schedule at most a year ahead")
    return when


async def _check_content(body: str, file_ids: list[PydanticObjectId], user: User) -> str:
    """Clean the text and make sure the files are the author's own uploads. Returns the HTML to store."""
    fields = compose(body, True, required=False)
    if not fields["text"] and not file_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Write something or attach a file")
    for fid in file_ids:
        await check_attachment("file", fid, user)
    return fields["body"]


async def _scheduled_outs(rows: list[ScheduledMessage]) -> list[ScheduledOut]:
    ids = {i for r in rows for i in r.file_ids}
    files = {f.id: f for f in await File.find({"_id": {"$in": list(ids)}}).to_list()} if ids else {}
    return [
        ScheduledOut(
            id=r.id,
            group_id=r.group_id,
            body=r.body,
            text=richtext.read(r.body)[0],
            files=[FileOut.model_validate(files[i], from_attributes=True) for i in r.file_ids if i in files],
            send_at=as_utc(r.send_at),
            created_at=as_utc(r.created_at),
        )
        for r in rows
    ]


async def _mine(scheduled_id: PydanticObjectId, user: User) -> ScheduledMessage:
    row = await ScheduledMessage.get(scheduled_id)
    if row is None or row.author_id != user.id or row.status != "scheduled":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled message not found")
    await member_group(row.group_id, user)
    return row


@router.get("/groups/{group_id}/scheduled", response_model=list[ScheduledOut])
async def list_scheduled(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[ScheduledOut]:
    """Your own messages in this group that are still waiting, soonest first."""
    group = await member_group(group_id, user)
    rows = await ScheduledMessage.find({"group_id": group.id, "author_id": user.id, "status": "scheduled"}).sort("+send_at").to_list()
    return await _scheduled_outs(rows)


@router.post("/groups/{group_id}/scheduled", response_model=ScheduledOut, status_code=status.HTTP_201_CREATED)
async def schedule(group_id: PydanticObjectId, body: ScheduledCreate, user: User = Depends(get_current_user)) -> ScheduledOut:
    group = await member_group(group_id, user)
    when = await _check_when(body.send_at)
    html = await _check_content(body.body, body.file_ids, user)
    row = await ScheduledMessage(group_id=group.id, author_id=user.id, body=html, file_ids=body.file_ids, send_at=when).insert()
    return (await _scheduled_outs([row]))[0]


@router.patch("/scheduled/{scheduled_id}", response_model=ScheduledOut)
async def edit_scheduled(scheduled_id: PydanticObjectId, body: ScheduledUpdate, user: User = Depends(get_current_user)) -> ScheduledOut:
    row = await _mine(scheduled_id, user)
    if body.send_at is not None:
        row.send_at = await _check_when(body.send_at)
    new_body = row.body if body.body is None else body.body
    new_files = row.file_ids if body.file_ids is None else body.file_ids
    row.body = await _check_content(new_body, new_files, user)
    dropped = [i for i in row.file_ids if i not in new_files]
    row.file_ids = new_files
    await row.save()
    await delete_files(dropped)
    return (await _scheduled_outs([row]))[0]


@router.delete("/scheduled/{scheduled_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_scheduled(scheduled_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Cancel it: it will never be sent, and its attachments are removed."""
    row = await _mine(scheduled_id, user)
    claimed = await ScheduledMessage.find({"_id": row.id, "status": "scheduled"}).update({"$set": {"status": "cancelled"}})
    if claimed.modified_count:  # the job may have taken it a moment ago
        await delete_files(row.file_ids)
