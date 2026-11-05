from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import DESCENDING, IndexModel


class Notification(Document):
    user_id: PydanticObjectId
    type: str
    title: str
    body: str = ""
    link: str | None = None
    actor_id: PydanticObjectId | None = None
    read: bool = False
    priority: str = "normal"  # "important" (mentions, approvals, overdue tasks) ignores the sound mute
    snoozed_until: datetime | None = None  # "Remind me in 1h": comes back as new when this passes
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notifications"
        indexes = [IndexModel([("user_id", 1), ("read", 1), ("created_at", DESCENDING)])]
