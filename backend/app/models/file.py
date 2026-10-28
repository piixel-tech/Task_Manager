from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field


class File(Document):
    owner_id: PydanticObjectId
    name: str
    mime: str
    size: int
    kind: Literal["upload", "link"]
    storage_key: str | None = None  # uploads only
    url: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "files"
