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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notifications"
        indexes = [IndexModel([("user_id", 1), ("read", 1), ("created_at", DESCENDING)])]
