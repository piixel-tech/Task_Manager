from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

TrashKind = Literal["task", "subfolder", "project", "message"]
KEEP_DAYS = 30


def _expires() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=KEEP_DAYS)


class TrashItem(Document):
    """Something deleted that an admin can still bring back. Its documents are kept here whole, and its files stay on disk
    until the item is restored or purged (30 days)."""

    kind: TrashKind
    title: str
    context: str = ""  # where it lived, for the list ("Acme › Design")
    original_id: PydanticObjectId
    deleted_by: PydanticObjectId | None = None
    deleted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=_expires)
    payload: dict[str, Any] = Field(default_factory=dict)  # collection name -> raw documents (and a few id lists)
    file_ids: list[PydanticObjectId] = Field(default_factory=list)  # files to delete if it is purged

    class Settings:
        name = "trash"
        indexes = [IndexModel([("expires_at", 1)]), IndexModel([("kind", 1), ("deleted_at", -1)])]
