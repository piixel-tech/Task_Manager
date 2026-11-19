from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PasswordReset(Document):
    """One "Forgot password?" link. Only the SHA-256 of the token is stored, so a database leak cannot be used to reset anyone."""

    user_id: PydanticObjectId
    token_hash: str
    expires_at: datetime
    used_at: datetime | None = None
    cancelled: bool = False  # a newer request replaced it
    created_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "password_resets"
        indexes = [IndexModel([("token_hash", 1)], unique=True), IndexModel([("user_id", 1), ("used_at", 1)])]


class ResetAttempt(Document):
    """One request to the "Forgot password?" form, kept whether or not the address belongs to anyone (that is what makes the
    3-per-hour limit say nothing about which accounts exist). Cleaned up by MongoDB after two hours."""

    email: str
    created_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "password_reset_attempts"
        indexes = [IndexModel([("email", 1), ("created_at", -1)]), IndexModel([("created_at", 1)], expireAfterSeconds=2 * 3600)]
