"""Helpers for chat groups and messages."""
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.permissions import can, require
from app.core.timeutil import as_utc
from app.models import File, Subfolder, Task, TrashItem, User
from app.models.approval import ClientApproval
from app.models.invite import Invite
from app.models.chat import ChatGroup, ChatMessage, LinkRef, Receipt
from app.models.office import REACTIONS
from app.schemas.chat import (
    ApprovalOut,
    GroupOut,
    LastMessage,
    MessageOut,
    TaskRef,
    ReactionOut,
    ReceiptOut,
    ReplyOut,
    SubfolderBrief,
)
from app.schemas.file import FileOut
from app.services import richtext
from app.services.notify import notify
from app.services.checklist import delete_files
from app.services.projects import brief, load_users, unique
from app.services.storage import get_storage
from app.services.ws_manager import manager

DELIVER_WINDOW = timedelta(days=30)  # on connect, only recent messages are marked delivered
DELETED_PREVIEW = "This message was deleted"
MAX_TEXT = 4000


def everyone(group: ChatGroup) -> list[PydanticObjectId]:
    """Team members and clients: everyone who can read the group."""
    return unique([*group.member_ids, *group.client_ids])


def groups_of(user: User) -> dict:
    return {"$or": [{"member_ids": user.id}, {"client_ids": user.id}]}


# --- Access ------------------------------------------------------------------------------------------------------
async def get_group_or_404(group_id: PydanticObjectId) -> ChatGroup:
    group = await ChatGroup.get(group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    return group


async def member_group(group_id: PydanticObjectId, user: User) -> ChatGroup:
    """The group, if the user is in it. Admins get no special view: they see only groups they're in."""
    group = await get_group_or_404(group_id)
    require(user, "chat.member", group)
    return group


async def check_people(ids: Iterable[PydanticObjectId]) -> None:
    found = await load_users(ids)
    for uid in unique(ids):
        u = found.get(uid)
        if u is None or not u.is_active or u.role not in ("admin", "employee"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Every member must be an active team member")


async def check_subfolder_link(subfolder_id: PydanticObjectId, user: User) -> Subfolder:
    sub = await Subfolder.get(subfolder_id)
    if sub is None or not can(user, "chat.link", sub):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a subfolder you are a member of")
    return sub


# --- Receipts and status ---------------------------------------------------------------------------------------
def joined_at(group: ChatGroup, uid: PydanticObjectId) -> datetime:
    when = (group.joined_at or {}).get(str(uid))
    return as_utc(when or group.created_at)


def recipients(msg: ChatMessage, group: ChatGroup) -> list[PydanticObjectId]:
    """Who should receive a message: everyone but the sender who was already in the group when it was sent."""
    sent = as_utc(msg.created_at)
    return [m for m in everyone(group) if m != msg.sender_id and joined_at(group, m) <= sent]


def status_of(msg: ChatMessage, group: ChatGroup) -> str:
    rec = recipients(msg, group)
    seen = {r.user_id for r in msg.seen_by}
    delivered = seen | {r.user_id for r in msg.delivered_to}
    if rec and all(u in seen for u in rec):
        return "seen"
    if rec and all(u in delivered for u in rec):
        return "delivered"
    return "sent"


def plain_of(msg: ChatMessage) -> str:
    """The message text without formatting."""
    return msg.text if msg.html else msg.body


def preview_of(msg: ChatMessage, file: File | None = None) -> str:
    if msg.deleted_for_all:
        return DELETED_PREVIEW
    if msg.type == "approval":
        return ("⏰ Reminder: " if msg.reminder else "✅ Approval: ") + plain_of(msg)
    if msg.type == "image":
        return "📷 " + (plain_of(msg) or "Photo")
    if msg.type == "voice":
        return "🎤 Voice message"
    if msg.type == "file":
        return "📎 " + (plain_of(msg) or (file.name if file else "File"))
    return plain_of(msg)


# --- Output ----------------------------------------------------------------------------------------------------------
def approval_out(a: ClientApproval, files: dict[PydanticObjectId, File], who) -> ApprovalOut:
    return ApprovalOut(
        id=a.id,
        question=a.question,
        files=[FileOut.model_validate(files[i], from_attributes=True) for i in a.file_ids if i in files],
        approve_label=a.approve_label,
        reject_label=a.reject_label,
        status=a.status,
        reason=a.reason,
        answered_by=who(a.answered_by) if a.answered_by else None,
        answered_at=as_utc(a.answered_at) if a.answered_at else None,
        created_at=as_utc(a.created_at),
        next_reminder_at=as_utc(a.next_reminder_at) if a.status == "pending" else None,
    )


async def message_outs(messages: list[ChatMessage], groups: dict[PydanticObjectId, ChatGroup]) -> list[MessageOut]:
    files = {f.id: f for f in await File.find({"_id": {"$in": unique(m.file_id for m in messages if m.file_id and not m.deleted_for_all)}}).to_list()}
    approvals = {
        a.id: a
        for a in await ClientApproval.find(
            {"_id": {"$in": unique(m.approval_id for m in messages if m.approval_id and not m.deleted_for_all)}}
        ).to_list()
    }
    approval_files = {
        f.id: f for f in await File.find({"_id": {"$in": unique(i for a in approvals.values() for i in a.file_ids)}}).to_list()
    }
    tasks = {t.id: t for t in await Task.find({"_id": {"$in": unique(m.task_id for m in messages if m.task_id)}}).to_list()}
    replies = {
        r.id: r for r in await ChatMessage.find({"_id": {"$in": unique(m.reply_to for m in messages if m.reply_to)}}).to_list()
    }
    people = await load_users(
        [m.sender_id for m in messages]
        + [m.forwarded_from for m in messages if m.forwarded_from]
        + [r.sender_id for r in replies.values()]
        + [a.answered_by for a in approvals.values() if a.answered_by]
    )
    who = lambda uid: brief(people[uid]) if uid in people else None  # noqa: E731

    out = []
    for m in messages:
        group = groups[m.group_id]
        gone = m.deleted_for_all
        reply = None
        if m.reply_to and not gone and (r := replies.get(m.reply_to)):
            reply = ReplyOut(
                id=r.id,
                sender=who(r.sender_id),
                type=r.type,
                preview=preview_of(r, files.get(r.file_id) if r.file_id else None),
                deleted=r.deleted_for_all,
            )
        file = files.get(m.file_id) if m.file_id and not gone else None
        approval = approval_out(approvals[m.approval_id], approval_files, who) if m.approval_id in approvals else None
        out.append(
            MessageOut(
                id=m.id,
                group_id=m.group_id,
                sender=who(m.sender_id),
                type=m.type,
                body="" if gone else m.body,
                html=m.html and not gone,
                text="" if gone else plain_of(m),
                mentions=[] if gone else m.mentions,
                links=[] if gone else [link.url for link in m.links],
                file=FileOut.model_validate(file, from_attributes=True) if file else None,
                duration=None if gone else m.duration,
                reply=reply,
                forwarded_from=None if gone else (who(m.forwarded_from) if m.forwarded_from else None),
                approval=approval,
                reminder=m.reminder and not gone,
                task=TaskRef(id=m.task_id, title=tasks[m.task_id].title) if m.task_id in tasks and not gone else None,
                reactions=[] if gone else [ReactionOut(emoji=e, user_ids=m.reactions[e]) for e in REACTIONS if m.reactions.get(e)],
                delivered_to=[ReceiptOut(user_id=r.user_id, at=as_utc(r.at)) for r in m.delivered_to],
                seen_by=[ReceiptOut(user_id=r.user_id, at=as_utc(r.at)) for r in m.seen_by],
                status=status_of(m, group),
                deleted=gone,
                created_at=as_utc(m.created_at),
            )
        )
    return out


async def unread_count(group: ChatGroup, user: User) -> int:
    return await ChatMessage.find(
        {
            "group_id": group.id,
            "sender_id": {"$ne": user.id},
            "created_at": {"$gte": joined_at(group, user.id)},
            "seen_by.user_id": {"$ne": user.id},
            "deleted_for": {"$ne": user.id},
            "deleted_for_all": False,
        }
    ).count()


async def group_outs(groups: list[ChatGroup], viewer: User) -> list[GroupOut]:
    subs = {s.id: s for s in await Subfolder.find({"_id": {"$in": unique(g.subfolder_id for g in groups if g.subfolder_id)}}).to_list()}
    lasts: dict[PydanticObjectId, ChatMessage | None] = {}
    for g in groups:
        lasts[g.id] = await ChatMessage.find({"group_id": g.id, "deleted_for": {"$ne": viewer.id}}).sort("-_id").first_or_none()
    last_files = {
        f.id: f for f in await File.find({"_id": {"$in": [m.file_id for m in lasts.values() if m and m.file_id]}}).to_list()
    }
    people = await load_users([m for g in groups for m in everyone(g)] + [m.sender_id for m in lasts.values() if m])

    out = []
    for g in groups:
        last = lasts[g.id]
        sub = subs.get(g.subfolder_id) if g.subfolder_id else None
        out.append(
            GroupOut(
                id=g.id,
                name=g.name,
                members=[brief(people[m]) for m in everyone(g) if m in people],
                joined_at={str(m): joined_at(g, m) for m in everyone(g)},
                created_by=g.created_by,
                subfolder=SubfolderBrief(id=sub.id, name=sub.name, project_id=sub.project_id) if sub else None,
                last_message=LastMessage(
                    preview=preview_of(last, last_files.get(last.file_id) if last.file_id else None),
                    sender=brief(people[last.sender_id]) if last.sender_id in people else None,
                    at=as_utc(last.created_at),
                    mine=last.sender_id == viewer.id,
                )
                if last
                else None,
                unread_count=await unread_count(g, viewer),
                can_manage=can(viewer, "chat.manage", g, creator_id=g.created_by),
                can_invite=can(viewer, "chat.invite", subs.get(g.subfolder_id) if g.subfolder_id else None),
                can_pin=can(viewer, "chat.pin", g),
                pinned_ids=[p.message_id for p in reversed(g.pins)],
                created_at=as_utc(g.created_at),
            )
        )
    return out


async def one_group(group_id: PydanticObjectId, viewer: User) -> GroupOut:
    return (await group_outs([await ChatGroup.get(group_id)], viewer))[0]


# --- Live events -----------------------------------------------------------------------------------------------
async def publish(user_ids: Iterable[PydanticObjectId], event: str, data: Any) -> None:
    await manager.send_to_users(user_ids, event, data)


async def publish_message(group: ChatGroup, msg: ChatMessage, event: str = "chat:message") -> MessageOut:
    out = (await message_outs([msg], {group.id: group}))[0]
    await publish(everyone(group), event, out.model_dump(mode="json"))
    return out


async def publish_receipts(group: ChatGroup, user: User, kind: str, ids: list[PydanticObjectId], at: datetime) -> None:
    if ids:
        await publish(
            everyone(group),
            "chat:receipts",
            {"group_id": str(group.id), "user_id": str(user.id), "kind": kind, "message_ids": [str(i) for i in ids], "at": at.isoformat()},
        )


async def notify_members(
    user_ids: Iterable[PydanticObjectId],
    actor: User,
    *,
    type: str,
    title: str,
    body: str,
    group_id: PydanticObjectId | None,
    message_id: PydanticObjectId | None = None,
) -> None:
    """notify() with a link that suits each person's area of the app. The actor isn't told about their own action."""
    people = await load_users([u for u in unique(user_ids) if u != actor.id])
    for role, base in (("admin", "/admin/chat"), ("employee", "/app/chat"), ("client", "/client/portal")):
        ids = [u.id for u in people.values() if u.role == role and u.is_active]
        link = base + (f"?group={group_id}" if group_id else "") + (f"&message={message_id}" if group_id and message_id else "")
        await notify(ids, type=type, title=title, body=body, link=link, actor_id=actor.id)


async def add_receipts(
    group: ChatGroup, user: User, *, seen: bool, message_ids: list[PydanticObjectId] | None = None
) -> list[PydanticObjectId]:
    """Record that `user` received (and, with seen=True, read) messages. Returns ids newly marked."""
    now = datetime.now(timezone.utc)
    since = joined_at(group, user.id)
    if not seen:
        since = max(since, now - DELIVER_WINDOW)  # on connect, don't walk the whole history
    base: dict = {"group_id": group.id, "sender_id": {"$ne": user.id}, "created_at": {"$gte": since}}
    if message_ids is not None:
        base["_id"] = {"$in": message_ids}

    newly_delivered = await ChatMessage.find({**base, "delivered_to.user_id": {"$ne": user.id}}).to_list()
    if newly_delivered:
        ids = [m.id for m in newly_delivered]
        await ChatMessage.find({"_id": {"$in": ids}, "delivered_to.user_id": {"$ne": user.id}}).update(
            {"$push": {"delivered_to": Receipt(user_id=user.id, at=now).model_dump()}}
        )
        await publish_receipts(group, user, "delivered", ids, now)
    if not seen:
        return [m.id for m in newly_delivered]

    unseen = await ChatMessage.find({**base, "seen_by.user_id": {"$ne": user.id}}).to_list()
    ids = [m.id for m in unseen]
    if ids:
        await ChatMessage.find({"_id": {"$in": ids}, "seen_by.user_id": {"$ne": user.id}}).update(
            {"$push": {"seen_by": Receipt(user_id=user.id, at=now).model_dump()}}
        )
        await publish_receipts(group, user, "seen", ids, now)
    return ids


async def on_connect(user: User) -> None:
    """A device came online: everything waiting for it counts as delivered."""
    for group in await ChatGroup.find(groups_of(user)).to_list():
        await add_receipts(group, user, seen=False)


async def typing(user: User, group_id: Any) -> None:
    """Tell the rest of the group that `user` is typing. Silently ignores anything invalid."""
    if not PydanticObjectId.is_valid(group_id):
        return
    group = await ChatGroup.get(PydanticObjectId(group_id))
    if group is None or not can(user, "chat.member", group):
        return
    await publish(
        [m for m in everyone(group) if m != user.id],
        "chat:typing",
        {"group_id": str(group.id), "user_id": str(user.id), "name": user.name},
    )


# --- Files -------------------------------------------------------------------------------------------------------------
async def check_attachment(msg_type: str, file_id: PydanticObjectId, user: User) -> File:
    """The file must be the sender's own upload and match the message type."""
    f = await File.get(file_id)
    if f is None or (f.owner_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid file: upload it first")
    drive_file = f.kind == "link" and f.drive is not None and msg_type == "file"  # a Google Drive file shares as a card
    if f.kind != "upload" and not drive_file:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Send an uploaded file, not a link")
    if msg_type == "image" and not f.mime.startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That file is not an image")
    if msg_type == "voice" and not f.mime.startswith("audio/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That file is not audio")
    return f


async def drop_file_if_unused(file_id: PydanticObjectId | None, ignore_trash: PydanticObjectId | None = None) -> None:
    """Delete a message's file once nothing uses it: no live message (a forward shares the same file) and no deleted
    message still waiting in the trash. `ignore_trash` is the trash item being purged right now."""
    if file_id is None:
        return
    if await ChatMessage.find({"file_id": file_id, "deleted_for_all": False}).count():
        return
    waiting = {"kind": "message", "payload.message.file_id": file_id}
    if ignore_trash:
        waiting["_id"] = {"$ne": ignore_trash}
    if await TrashItem.find(waiting).count():
        return
    f = await File.get(file_id)
    if f:
        if f.storage_key:
            await get_storage().delete(f.storage_key)
        await f.delete()


async def delete_group_content(group: ChatGroup) -> None:
    from app.services.trash import purge_group_messages  # late: the trash service imports this module

    await purge_group_messages(group.id)
    msgs = await ChatMessage.find({"group_id": group.id}).to_list()
    await ChatMessage.find({"group_id": group.id}).delete()
    for fid in unique(m.file_id for m in msgs if m.file_id):
        await drop_file_if_unused(fid)
    approvals = await ClientApproval.find({"group_id": group.id}).to_list()
    await ClientApproval.find({"group_id": group.id}).delete()
    await delete_files(unique(i for a in approvals for i in a.file_ids))
    await Invite.find({"group_id": group.id}).delete()


async def create_message(group: ChatGroup, sender: User, **fields) -> ChatMessage:
    """Store a message and bump the group's activity. Anyone with the app open already has it: that's "delivered"."""
    now = datetime.now(timezone.utc)
    if fields.get("file_id") and fields.get("type") in ("image", "file") and "file_kind" not in fields:
        f = await File.get(fields["file_id"])
        fields["file_kind"] = "media" if f and f.mime.startswith(("image/", "video/")) else "doc"
    msg = ChatMessage(group_id=group.id, sender_id=sender.id, created_at=now, **fields)
    msg.delivered_to = [Receipt(user_id=m, at=now) for m in everyone(group) if m != sender.id and manager.is_online(m)]
    await msg.insert()
    await ChatGroup.find({"_id": group.id}).update({"$set": {"last_message_at": now}})
    return msg


# --- Rich text, mentions and sending ------------------------------------------------------------------------------------
def compose(body: str, html: bool, *, required: bool) -> dict:
    """Message fields for a body: clean HTML plus the plain text, mentions and links read from it."""
    if not html:
        text = body.strip()
        return {"body": text, "html": False, "text": "", "mentions": [], "links": [LinkRef(url=u) for u in richtext.links_in(text)]}
    clean = richtext.sanitize(body)
    text, mentions, links = richtext.read(clean)
    if required and not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A text message needs some text")
    if len(text) > MAX_TEXT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Keep messages under {MAX_TEXT} characters")
    return {"body": clean if text else "", "html": bool(text), "text": text, "mentions": mentions, "links": [LinkRef(url=u) for u in links]}


async def post_message(group: ChatGroup, sender: User, **fields) -> MessageOut:
    """Create, publish and notify: what every normal send does, whether typed now or scheduled earlier."""
    allowed = {m for m in everyone(group) if m != sender.id}
    fields["mentions"] = [m for m in fields.get("mentions", []) if m in allowed]  # only people who can read it
    msg = await create_message(group, sender, **fields)
    out = await publish_message(group, msg)
    if msg.mentions:
        await notify_members(
            msg.mentions,
            sender,
            type="mention",
            title=f"{sender.name} mentioned you in {group.name}",
            body=plain_of(msg)[:140],
            group_id=group.id,
            message_id=msg.id,
        )
    return out
