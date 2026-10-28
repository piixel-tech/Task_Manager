from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import IndexModel


class Version(BaseModel):
    """An earlier state of a requirement, kept when it was replaced by an edit."""

    title: str
    details: str = ""
    attachment_ids: list[PydanticObjectId] = Field(default_factory=list)
    subfolder_id: PydanticObjectId | None = None
    edited_by: PydanticObjectId  # who wrote this version
    edited_at: datetime  # when this version was written


class Requirement(Document):
    """One entry in a project's running record of what the client asked for."""

    project_id: PydanticObjectId
    subfolder_id: PydanticObjectId | None = None  # optional tag
    title: str
    details: str = ""
    attachment_ids: list[PydanticObjectId] = Field(default_factory=list)  # files and links from the file service
    created_by: PydanticObjectId
    history: list[Version] = Field(default_factory=list)  # earlier versions, oldest first
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))  # when the current version was written

    class Settings:
        name = "requirements"
        indexes = [IndexModel([("project_id", 1), ("created_at", -1)])]
