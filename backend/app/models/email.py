from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EmailSender(Document):
    """The one Gmail mailbox every email is sent from (workspace-wide, connected by an admin). The refresh token is Fernet ciphertext."""

    address: str
    refresh_token: str  # encrypted
    status: Literal["connected", "needs_reconnect"] = "connected"
    connected_by: PydanticObjectId | None = None
    created_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "email_sender"


class EmailLog(Document):
    """One email we were asked to send: who to, what for, and how it went. Admin-only."""

    to: str
    type: str  # what caused it: "test", "task_assigned", ...
    subject: str
    status: Literal["queued", "sent", "failed"] = "queued"
    error: str | None = None
    attempts: int = 0
    created_at: datetime = Field(default_factory=_now)
    sent_at: datetime | None = None

    class Settings:
        name = "email_log"
        indexes = [IndexModel([("created_at", -1)])]
