"""Reminders for client approvals that are still waiting for an answer."""
from datetime import datetime, timezone

from app.models import ClientApproval, User
from app.models.approval import REMIND_EVERY
from app.models.chat import ChatGroup
from app.services.chat import create_message, notify_members, publish_message


async def run_approval_reminders(now: datetime | None = None, *, force: bool = False) -> int:
    """Remind the client(s) about every approval that has waited another 24 hours. Returns how many were sent.

    Each reminder is a notification to the client(s) in the group plus a repeat of the card in the chat. Nobody
    else is told: there is no escalation. A due approval is claimed atomically before anything is sent, so two
    runs (or two processes) never send the same reminder twice. `force` ignores the schedule (dev helper).
    """
    now = now or datetime.now(timezone.utc)
    query: dict = {"status": "pending"}
    if not force:
        query["next_reminder_at"] = {"$lte": now}
    sent = 0

    for approval in await ClientApproval.find(query).to_list():
        claimed = await ClientApproval.find(
            {"_id": approval.id, "status": "pending", "next_reminder_at": approval.next_reminder_at}
        ).update({"$set": {"next_reminder_at": now + REMIND_EVERY}, "$inc": {"reminders_sent": 1}})
        if not claimed or claimed.modified_count != 1:
            continue

        group = await ChatGroup.get(approval.group_id)
        if group is None:
            await ClientApproval.find({"_id": approval.id}).update({"$set": {"status": "cancelled"}})
            continue
        asker = await User.get(approval.created_by)
        if not group.client_ids or asker is None:
            continue  # nobody to remind (yet); try again in 24 hours

        reminder = await create_message(group, asker, type="approval", body=approval.question, approval_id=approval.id, reminder=True)
        await publish_message(group, reminder)
        await notify_members(
            group.client_ids,
            asker,
            type="approval_reminder",
            title=f"Reminder: your answer is needed in {group.name}",
            body=approval.question[:140],
            group_id=group.id,
        )
        sent += 1
    return sent
