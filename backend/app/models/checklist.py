from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class ChecklistItem(Document):
    subfolder_id: PydanticObjectId
    text: str
    attachment_ids: list[PydanticObjectId] = Field(default_factory=list)  # files and links from the file service
    created_by: PydanticObjectId
    updated_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "checklist_items"
        indexes = [IndexModel([("subfolder_id", 1), ("created_at", 1)])]
