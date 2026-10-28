"""Sends the messages people scheduled, as ordinary messages from them, when their time comes."""
import logging
from datetime import datetime, timezone

from app.core.permissions import can
from app.models import File, User
from app.models.chat import ChatGroup, ScheduledMessage
from app.services.chat import compose, post_message
from app.services.notify import notify

log = logging.getLogger(__name__)

CHAT_HOME = {"admin": "/admin/chat", "employee": "/app/chat", "client": "/client/chats"}


async def _deliver(row: ScheduledMessage) -> None:
    group = await ChatGroup.get(row.group_id)
    author = await User.get(row.author_id)
    if group is None:
        raise ValueError("The group no longer exists")
    if author is None or not author.is_active or not can(author, "chat.member", group):
        raise ValueError("You are no longer in this group")

    fields = compose(row.body, True, required=False)
    files = await File.find({"_id": {"$in": row.file_ids}}).to_list()
    files.sort(key=lambda f: row.file_ids.index(f.id))
    if not files:
        await post_message(group, author, type="text", **fields)
        return
    for i, f in enumerate(files):  # the text rides along as the caption of the first file
        await post_message(
            group, author, type="image" if f.mime.startswith("image/") else "file", file_id=f.id, **(fields if i == 0 else compose("", False, required=False))
        )


async def run_scheduled_sends() -> int:
    """Send everything that is due. Returns how many went out."""
    due = await ScheduledMessage.find({"status": "scheduled", "send_at": {"$lte": datetime.now(timezone.utc)}}).sort("+send_at").to_list()
    sent = 0
    for row in due:
        # Claim it first so two overlapping runs (or a cancel) can't send it twice.
        claimed = await ScheduledMessage.find({"_id": row.id, "status": "scheduled"}).update({"$set": {"status": "sent"}})
        if not claimed.modified_count:
            continue
        try:
            await _deliver(row)
            sent += 1
        except Exception as exc:  # one bad message must not hold up the rest
            log.warning("Scheduled message %s failed: %s", row.id, exc)
            await ScheduledMessage.find({"_id": row.id}).update({"$set": {"status": "failed", "error": str(exc)}})
            author = await User.get(row.author_id)
            if author:
                await notify(
                    [author.id],
                    type="chat_scheduled_failed",
                    title="A scheduled message was not sent",
                    body=str(exc),
                    link=CHAT_HOME.get(author.role, "/app/chat") + f"?group={row.group_id}",
                )
    return sent
