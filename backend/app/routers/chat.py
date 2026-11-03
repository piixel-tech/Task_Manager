from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import User
from app.models import ClientApproval
from app.models.chat import ChatGroup, ChatMessage
from app.schemas.chat import (
    ForwardBody,
    GroupCreate,
    GroupOut,
    GroupUpdate,
    MembersAdd,
    MessageCreate,
    MessageOut,
    MessagePage,
    ReactionSet,
    ReadOut,
    UnreadOut,
)
from app.services.chat import (
    add_receipts,
    check_attachment,
    check_people,
    check_subfolder_link,
    compose,
    create_message,
    delete_group_content,
    everyone,
    group_outs,
    groups_of,
    member_group,
    message_outs,
    notify_members,
    one_group,
    post_message,
    publish,
    publish_message,
    unread_count,
)
from app.services.projects import unique
from app.services.trash import trash_message

router = APIRouter(prefix="/chat", tags=["chat"])

PAGE_SIZE = 30


async def _push_group(group: ChatGroup, extra: list[PydanticObjectId] = ()) -> None:
    """Tell everyone's open app that this group changed (or appeared, or went away)."""
    await publish([*everyone(group), *extra], "chat:group", {"group_id": str(group.id)})


async def _message_or_404(message_id: PydanticObjectId, user: User) -> tuple[ChatMessage, ChatGroup]:
    msg = await ChatMessage.get(message_id)
    if msg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    group = await member_group(msg.group_id, user)
    if user.id in msg.deleted_for:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return msg, group


# --- Groups ------------------------------------------------------------------------------------------------------------
@router.get("/groups", response_model=list[GroupOut])
async def list_groups(user: User = Depends(get_current_user)) -> list[GroupOut]:
    """Only groups you are in (admins too), most recently active first. Clients see the groups they joined."""
    require(user, "chat.list")
    groups = await ChatGroup.find(groups_of(user)).to_list()
    groups.sort(key=lambda g: g.last_message_at or g.created_at, reverse=True)
    return await group_outs(groups, user)


@router.get("/unread", response_model=UnreadOut)
async def unread(user: User = Depends(get_current_user)) -> UnreadOut:
    require(user, "chat.list")
    counts = {str(g.id): await unread_count(g, user) for g in await ChatGroup.find(groups_of(user)).to_list()}
    return UnreadOut(total=sum(counts.values()), by_group=counts)


@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupCreate, user: User = Depends(get_current_user)) -> GroupOut:
    require(user, "chat.create")
    members = unique([user.id, *body.member_ids])
    await check_people(members)
    if body.subfolder_id:
        await check_subfolder_link(body.subfolder_id, user)
    now = datetime.now(timezone.utc)
    group = await ChatGroup(
        name=body.name,
        member_ids=members,
        subfolder_id=body.subfolder_id,
        created_by=user.id,
        joined_at={str(m): now for m in members},
    ).insert()
    await notify_members(
        members, user, type="chat_group", title=f"New group: {group.name}", body=f"{user.name} added you to “{group.name}”.", group_id=group.id
    )
    await _push_group(group)
    return await one_group(group.id, user)


@router.get("/groups/{group_id}", response_model=GroupOut)
async def get_group(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> GroupOut:
    group = await member_group(group_id, user)
    return await one_group(group.id, user)


@router.patch("/groups/{group_id}", response_model=GroupOut)
async def update_group(group_id: PydanticObjectId, body: GroupUpdate, user: User = Depends(get_current_user)) -> GroupOut:
    """Rename the group or link/unlink a subfolder. Creator only."""
    group = await member_group(group_id, user)
    require(user, "chat.manage", group, creator_id=group.created_by)
    changes = []
    if body.name is not None and body.name != group.name:
        changes.append(f"renamed it to “{body.name}”")
        group.name = body.name
    if "subfolder_id" in body.model_fields_set and body.subfolder_id != group.subfolder_id:
        if body.subfolder_id:
            await check_subfolder_link(body.subfolder_id, user)
        group.subfolder_id = body.subfolder_id
        changes.append("linked a subfolder" if body.subfolder_id else "unlinked the subfolder")
    if changes:
        await group.save()
        await notify_members(
            everyone(group), user, type="chat_group", title=f"Group updated: {group.name}", body=f"{user.name} {' and '.join(changes)}.", group_id=group.id
        )
        await _push_group(group)
    return await one_group(group.id, user)


@router.post("/groups/{group_id}/members", response_model=GroupOut)
async def add_members(group_id: PydanticObjectId, body: MembersAdd, user: User = Depends(get_current_user)) -> GroupOut:
    """Any team member can add people. Clients join through an invite link instead."""
    require(user, "chat.create")
    group = await member_group(group_id, user)
    new = [u for u in unique(body.user_ids) if u not in everyone(group)]
    await check_people(new)
    if new:
        now = datetime.now(timezone.utc)
        group.member_ids = [*group.member_ids, *new]
        group.joined_at = {**group.joined_at, **{str(u): now for u in new}}
        await group.save()
        await notify_members(
            new, user, type="chat_group", title=f"Added to {group.name}", body=f"{user.name} added you to “{group.name}”.", group_id=group.id
        )
        await _push_group(group)
    return await one_group(group.id, user)


@router.delete("/groups/{group_id}/members/{user_id}", response_model=GroupOut | None)
async def remove_member(group_id: PydanticObjectId, user_id: PydanticObjectId, user: User = Depends(get_current_user)):
    """The creator removes anyone; everyone else can only remove themselves (leave). The creator can't leave."""
    group = await member_group(group_id, user)
    if user_id not in everyone(group):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person is not in the group")
    if user_id == group.created_by:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The creator can't leave. Delete the group instead.")
    if user_id != user.id:
        require(user, "chat.manage", group, creator_id=group.created_by)
    group.member_ids = [m for m in group.member_ids if m != user_id]
    group.client_ids = [m for m in group.client_ids if m != user_id]
    group.joined_at = {k: v for k, v in group.joined_at.items() if k != str(user_id)}
    await group.save()
    if user_id != user.id:
        await notify_members([user_id], user, type="chat_group", title=f"Removed from {group.name}", body=f"{user.name} removed you from “{group.name}”.", group_id=None)
    else:
        await notify_members(everyone(group), user, type="chat_group", title=f"{group.name}", body=f"{user.name} left the group.", group_id=group.id)
    await _push_group(group, extra=[user_id])
    return await one_group(group.id, user) if user.id in everyone(group) else None


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Creator only. Removes the group, its messages and their files."""
    group = await member_group(group_id, user)
    require(user, "chat.manage", group, creator_id=group.created_by)
    members = everyone(group)
    await delete_group_content(group)
    await group.delete()
    await notify_members(members, user, type="chat_group", title="Group deleted", body=f"{user.name} deleted “{group.name}”.", group_id=None)
    await publish(members, "chat:group", {"group_id": str(group.id)})


# --- Messages ----------------------------------------------------------------------------------------------------------
@router.get("/groups/{group_id}/messages", response_model=MessagePage)
async def list_messages(
    group_id: PydanticObjectId,
    before: PydanticObjectId | None = Query(None, description="Load messages older than this one"),
    after: PydanticObjectId | None = Query(None, description="Load messages newer than this one"),
    around: PydanticObjectId | None = Query(None, description="Load a window centred on this message (jump to it)"),
    limit: int = Query(PAGE_SIZE, ge=1, le=100),
    user: User = Depends(get_current_user),
) -> MessagePage:
    """Newest page first by default; `before` goes further back, `after` forward, `around` opens a window on one message. Items come oldest first."""
    group = await member_group(group_id, user)
    base: dict = {"group_id": group.id, "deleted_for": {"$ne": user.id}}

    async def older(than: dict, n: int) -> list[ChatMessage]:
        return await ChatMessage.find({**base, "_id": than}).sort("-_id").limit(n).to_list()

    if around:
        target = await ChatMessage.get(around)
        if target is None or target.group_id != group.id or user.id in target.deleted_for:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
        half = max(limit // 2, 1)
        back = await older({"$lt": around}, half + 1)
        forward = await ChatMessage.find({**base, "_id": {"$gt": around}}).sort("_id").limit(half + 1).to_list()
        rows = [*reversed(back[:half]), target, *forward[:half]]
        return MessagePage(items=await message_outs(rows, {group.id: group}), has_more=len(back) > half, has_newer=len(forward) > half)
    if after:
        rows = await ChatMessage.find({**base, "_id": {"$gt": after}}).sort("_id").limit(limit + 1).to_list()
        return MessagePage(items=await message_outs(rows[:limit], {group.id: group}), has_more=False, has_newer=len(rows) > limit)
    rows = await older({"$lt": before} if before else {"$exists": True}, limit + 1)
    has_more = len(rows) > limit
    rows = list(reversed(rows[:limit]))
    return MessagePage(items=await message_outs(rows, {group.id: group}), has_more=has_more)


@router.post("/groups/{group_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(group_id: PydanticObjectId, body: MessageCreate, user: User = Depends(get_current_user)) -> MessageOut:
    group = await member_group(group_id, user)
    if body.file_id:
        await check_attachment(body.type, body.file_id, user)
    if body.reply_to:
        target = await ChatMessage.get(body.reply_to)
        if target is None or target.group_id != group.id or target.deleted_for_all:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The message you are replying to is not in this group")
    fields = compose(body.body, body.html, required=body.type == "text") if body.body else {"body": "", "html": False, "text": "", "mentions": [], "links": []}
    return await post_message(group, user, type=body.type, file_id=body.file_id, duration=body.duration, reply_to=body.reply_to, **fields)


@router.post("/groups/{group_id}/meet", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def start_meet(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> MessageOut:
    """Start a Google Meet for the group: a new Meet link is made on the sender's Google Calendar and posted as a message."""
    from app.integrations.google import workspace  # late: the Google module pulls in the chat-independent integrations stack

    group = await member_group(group_id, user)
    require(user, "integration.manage")  # clients have no Google connection
    url = await workspace.start_meet(user, f"{group.name}: Google Meet")
    fields = compose(f"📹 {user.name} started a Google Meet\n{url}", False, required=True)
    return await post_message(group, user, type="text", **fields)


@router.post("/groups/{group_id}/read", response_model=ReadOut)
async def mark_read(group_id: PydanticObjectId, user: User = Depends(get_current_user)) -> ReadOut:
    """You opened the conversation: everything in it is now seen by you."""
    group = await member_group(group_id, user)
    await add_receipts(group, user, seen=True)
    return ReadOut(unread_count=await unread_count(group, user))


@router.put("/messages/{message_id}/reactions", response_model=MessageOut)
async def toggle_reaction(message_id: PydanticObjectId, body: ReactionSet, user: User = Depends(get_current_user)) -> MessageOut:
    msg, group = await _message_or_404(message_id, user)
    if msg.deleted_for_all:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    op = "$pull" if user.id in msg.reactions.get(body.emoji, []) else "$addToSet"
    await ChatMessage.find({"_id": msg.id}).update({op: {f"reactions.{body.emoji}": user.id}})
    return await publish_message(group, await ChatMessage.get(msg.id), "chat:message_update")


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: PydanticObjectId,
    scope: str = Query("me", pattern="^(me|everyone)$"),
    user: User = Depends(get_current_user),
) -> None:
    """`me` hides it from you only. `everyone` removes it for the whole group and is for the sender only."""
    msg, group = await _message_or_404(message_id, user)
    if scope == "me":
        await ChatMessage.find({"_id": msg.id}).update({"$addToSet": {"deleted_for": user.id}})
        await publish([user.id], "chat:message_removed", {"group_id": str(group.id), "message_id": str(msg.id)})
        return
    if msg.sender_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the sender can delete a message for everyone")
    if msg.deleted_for_all:
        return
    await trash_message(msg, user, group.name)  # an admin can bring it back for 30 days; its file stays until then
    if msg.approval_id and not msg.reminder:  # withdrawing the card withdraws the question: no more reminders
        await ClientApproval.find({"_id": msg.approval_id, "status": "pending"}).update({"$set": {"status": "cancelled"}})
    await ChatMessage.find({"_id": msg.id}).update(
        {
            "$set": {
                "deleted_for_all": True, "body": "", "html": False, "text": "", "mentions": [], "links": [],
                "file_id": None, "duration": None, "reply_to": None, "reactions": {},
            }
        }
    )
    if any(p.message_id == msg.id for p in group.pins):
        await ChatGroup.find({"_id": group.id}).update({"$pull": {"pins": {"message_id": msg.id}}})
        await _push_group(group)
    await publish_message(group, await ChatMessage.get(msg.id), "chat:message_update")


@router.post("/messages/{message_id}/forward", response_model=list[MessageOut], status_code=status.HTTP_201_CREATED)
async def forward_message(message_id: PydanticObjectId, body: ForwardBody, user: User = Depends(get_current_user)) -> list[MessageOut]:
    """Copy a message into other groups you are in. Replies don't carry over; the original sender is shown."""
    msg, _ = await _message_or_404(message_id, user)
    if msg.deleted_for_all:
        raise HTTPException(status.HTTP_409_CONFLICT, "This message was deleted")
    if msg.type == "approval":
        raise HTTPException(status.HTTP_409_CONFLICT, "Approval requests can't be forwarded")
    targets = []
    for gid in unique(body.group_ids):
        targets.append(await member_group(gid, user))  # 403/404 before anything is sent
    out = []
    for group in targets:
        copy = await create_message(
            group,
            user,
            type=msg.type,
            body=msg.body,
            html=msg.html,
            text=msg.text,
            links=msg.links,
            file_kind=msg.file_kind,
            file_id=msg.file_id,
            duration=msg.duration,
            forwarded_from=msg.forwarded_from or msg.sender_id,
        )
        out.append(await publish_message(group, copy))
    return out
