from datetime import datetime, timedelta, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

ApprovalStatus = Literal["pending", "approved", "rejected", "cancelled"]
REMIND_EVERY = timedelta(hours=24)


def _first_reminder() -> datetime:
    return datetime.now(timezone.utc) + REMIND_EVERY


class ClientApproval(Document):
    """A question put to the client(s) in a chat group, answered with one of two custom buttons."""

    message_id: PydanticObjectId | None = None  # the card in the chat (set right after it is posted)
    group_id: PydanticObjectId
    question: str
    file_ids: list[PydanticObjectId] = Field(default_factory=list)
    approve_label: str = "Approve"
    reject_label: str = "Reject"
    status: ApprovalStatus = "pending"
    reason: str | None = None  # required when rejected
    answered_by: PydanticObjectId | None = None
    answered_at: datetime | None = None
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    next_reminder_at: datetime = Field(default_factory=_first_reminder)
    reminders_sent: int = 0

    class Settings:
        name = "client_approvals"
        indexes = [IndexModel([("status", 1), ("next_reminder_at", 1)]), IndexModel([("group_id", 1)])]
