from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_FILES = 20
MAX_DETAILS = 10_000

Badge = Literal["client", "head", "admin", "member"]


def _title(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("must not be empty")
    return v


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=MAX_DETAILS)
    attachment_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_FILES)
    subfolder_id: PydanticObjectId | None = None

    clean_title = field_validator("title")(_title)

    @model_validator(mode="after")
    def _something_to_say(self) -> "RequirementCreate":
        self.details = self.details.strip()
        if not self.details and not self.attachment_ids:
            raise ValueError("Write some details or attach a file or link")
        return self


class RequirementUpdate(BaseModel):
    """Only what you send changes. `subfolder_id: null` removes the tag."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    details: str | None = Field(default=None, max_length=MAX_DETAILS)
    attachment_ids: list[PydanticObjectId] | None = Field(default=None, max_length=MAX_FILES)
    subfolder_id: PydanticObjectId | None = None

    clean_title = field_validator("title")(lambda v: _title(v) if v is not None else v)


class SubfolderTag(BaseModel):
    id: PydanticObjectId
    name: str


class RequirementOut(BaseModel):
    id: PydanticObjectId
    project_id: PydanticObjectId
    subfolder: SubfolderTag | None
    title: str
    details: str
    attachments: list[FileOut]
    author: UserBrief | None
    author_badge: Badge
    created_at: datetime
    updated_at: datetime
    edited: bool  # has earlier versions
    version_count: int
    can_edit: bool  # the author
    can_delete: bool  # admins


class VersionOut(BaseModel):
    number: int  # 1 = the original
    current: bool
    title: str
    details: str
    attachments: list[FileOut]
    subfolder: SubfolderTag | None
    edited_by: UserBrief | None
    edited_at: datetime


class RequirementDetail(RequirementOut):
    versions: list[VersionOut]  # newest first, the current one on top


class RequirementList(BaseModel):
    total: int  # matching the filters, across all pages
    can_add: bool
    items: list[RequirementOut]  # newest first
