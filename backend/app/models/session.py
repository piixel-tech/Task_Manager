from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Session(Document):
    """One sign-in on one device. Revoking it signs that device out."""

    user_id: PydanticObjectId
    user_agent: str = ""
    ip: str = ""
    revoked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_seen_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "sessions"
        indexes = [IndexModel([("user_id", 1), ("revoked", 1)])]
