from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class PushSubscription(Document):
    """One browser's Web Push subscription. A person can have several (laptop, phone, ...)."""

    user_id: PydanticObjectId
    endpoint: str  # the push service URL; unique per browser profile
    p256dh: str
    auth: str
    user_agent: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "push_subscriptions"
        indexes = [IndexModel([("endpoint", 1)], unique=True), IndexModel([("user_id", 1)])]
