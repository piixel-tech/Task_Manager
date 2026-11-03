from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class DriveMeta(BaseModel):
    """What we remember about a Google Drive file. Metadata only: the bytes stay in Drive."""

    file_id: str
    mime: str  # Google's own mime type, e.g. application/vnd.google-apps.document
    kind: Literal["document", "spreadsheet", "presentation", "pdf", "image", "video", "folder", "other"] = "other"
    icon_url: str | None = None
    modified_at: datetime | None = None


class File(Document):
    owner_id: PydanticObjectId
    name: str
    mime: str
    size: int
    kind: Literal["upload", "link"]
    storage_key: str | None = None  # uploads only
    url: str  # links (Drive files too): the external address
    drive: DriveMeta | None = None  # set for files attached from Google Drive; they are kind "link" everywhere else
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "files"
