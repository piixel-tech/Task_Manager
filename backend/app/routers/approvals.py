from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.core.permissions import require
from app.models import ClientApproval, File, User
from app.models.chat import ChatGroup, ChatMessage
from app.schemas.chat import ApprovalAnswer, ApprovalCreate, ApprovalItem, MessageOut
from app.services.approvals import run_approval_reminders
from app.services.chat import (
    approval_out,
    create_message,
    everyone,
    groups_of,
    member_group,
    notify_members,
    publish_message,
)
from app.services.projects import brief, load_users, unique
from app.services.tasks import check_assets

router = APIRouter(prefix="/chat", tags=["approvals"])


def _snippet(text: str, n: int = 140) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


@router.post("/groups/{group_id}/approvals", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def request_approval(group_id: PydanticObjectId, body: ApprovalCreate, user: User = Depends(get_current_user)) -> MessageOut:
    """Post an approval card for the client(s) in this group. Any team member of the group can."""
    group = await member_group(group_id, user)
    require(user, "chat.request_approval", group)
    if not group.client_ids:
        raise HTTPException(status.HTTP_409_CONFLICT, "No client has joined this group yet. Invite one first.")
    await check_assets(body.file_ids, user)
    approval = await ClientApproval(
        group_id=group.id,
        question=body.question,
        file_ids=unique(body.file_ids),
        approve_label=body.approve_label,
        reject_label=body.reject_label,
        created_by=user.id,
    ).insert()
    msg = await create_message(group, user, type="approval", body=approval.question, approval_id=approval.id)
    await ClientApproval.find({"_id": approval.id}).update({"$set": {"message_id": msg.id}})
    await notify_members(
        group.client_ids,
        user,
        type="client_approval",
        title=f"Approval needed: {group.name}",
        body=_snippet(approval.question),
        group_id=group.id,
    )
    return await publish_message(group, msg)


@router.post("/approvals/{approval_id}/answer", response_model=MessageOut)
async def answer_approval(approval_id: PydanticObjectId, body: ApprovalAnswer, user: User = Depends(get_current_user)) -> MessageOut:
    """A client taps one of the two buttons. Rejecting needs a reason. The first answer wins."""
    approval = await ClientApproval.get(approval_id)
    if approval is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approval not found")
    group = await member_group(approval.group_id, user)
    require(user, "chat.answer_approval", group)
    if approval.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request is already {approval.status}")

    flipped = await ClientApproval.find({"_id": approval.id, "status": "pending"}).update(
        {"$set": {"status": body.decision, "reason": body.reason, "answered_by": user.id, "answered_at": datetime.now(timezone.utc)}}
    )
    if not flipped or flipped.modified_count != 1:  # someone else answered a moment ago
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was just answered by someone else")

    # The card and every reminder of it update live for everyone.
    cards = await ChatMessage.find({"approval_id": approval.id, "deleted_for_all": False}).sort("_id").to_list()
    outs = [await publish_message(group, m, "chat:message_update") for m in cards]
    label = approval.approve_label if body.decision == "approved" else approval.reject_label
    await notify_members(
        group.member_ids,
        user,
        type="approval_answered",
        title=f"{'✅ Approved' if body.decision == 'approved' else '❌ Rejected'}: {_snippet(approval.question, 60)}",
        body=f"{user.name} chose “{label}”." + (f" Reason: {body.reason}" if body.reason else ""),
        group_id=group.id,
    )
    if not outs:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The approval card was deleted")
    return outs[0]


@router.get("/approvals", response_model=list[ApprovalItem])
async def list_approvals(
    status_: str = Query("pending", alias="status", pattern="^(pending|all)$"),
    user: User = Depends(get_current_user),
) -> list[ApprovalItem]:
    """Approvals in the groups you are in; clients use this for their "waiting for you" list."""
    require(user, "chat.list")
    groups = {g.id: g for g in await ChatGroup.find(groups_of(user)).to_list()}
    query: dict = {"group_id": {"$in": list(groups)}}
    query["status"] = "pending" if status_ == "pending" else {"$ne": "cancelled"}
    approvals = await ClientApproval.find(query).sort("-created_at").limit(100).to_list()
    files = {f.id: f for f in await File.find({"_id": {"$in": unique(i for a in approvals for i in a.file_ids)}}).to_list()}
    people = await load_users(a.answered_by for a in approvals if a.answered_by)
    who = lambda uid: brief(people[uid]) if uid in people else None  # noqa: E731
    return [
        ApprovalItem(approval=approval_out(a, files, who), group_id=a.group_id, group_name=groups[a.group_id].name, message_id=a.message_id)
        for a in approvals
    ]


# --- Development helper ---------------------------------------------------------------------------------
if settings.ENVIRONMENT == "development":

    class ReminderRun(BaseModel):
        sent: int

    @router.post("/approvals/reminders/run", response_model=ReminderRun)
    async def run_reminders_now(
        force: bool = Query(False, description="Remind every pending approval now, not only the ones that have waited 24 hours"),
        _: User = Depends(require_role("admin")),
    ) -> ReminderRun:
        """Dev only: run the approval reminder job right now."""
        return ReminderRun(sent=await run_approval_reminders(force=force))
