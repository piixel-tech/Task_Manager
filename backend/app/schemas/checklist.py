from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_FILES = 20


class ChecklistFileOut(FileOut):
    owner: UserBrief | None = None  # who attached it


def _clean_text(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("must not be empty")
    return v


class ChecklistItemCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    attachment_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_FILES)

    clean_text = field_validator("text")(_clean_text)


class ChecklistItemUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=500)

    clean_text = field_validator("text")(_clean_text)


class AttachBody(BaseModel):
    file_ids: list[PydanticObjectId] = Field(min_length=1, max_length=MAX_FILES)


class ChecklistItemOut(BaseModel):
    id: PydanticObjectId
    subfolder_id: PydanticObjectId
    text: str
    created_by: UserBrief | None
    created_at: datetime
    updated_at: datetime | None  # set once the text has been edited
    attachments: list[ChecklistFileOut]
    can_edit: bool  # the person who added it
    can_delete: bool  # the person who added it, a head or an admin


class ChecklistOut(BaseModel):
    can_write: bool  # add, edit own, attach
    can_manage: bool  # delete anyone's item or attachment
    items: list[ChecklistItemOut]
