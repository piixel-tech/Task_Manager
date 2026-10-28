from datetime import datetime, timedelta, timezone
from typing import Annotated

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field

INVITE_DAYS = 7


def _in_a_week() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS)


class Invite(Document):
    """A shareable link that lets a client join one chat group. Several clients can use the same link."""

    group_id: PydanticObjectId
    token: Annotated[str, Indexed(unique=True)]
    created_by: PydanticObjectId
    expires_at: datetime = Field(default_factory=_in_a_week)
    revoked: bool = False
    used_by: list[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "invites"
