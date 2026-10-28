from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field

from app.models.activity import ActivityKind
from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_HTML = 20000
MAX_FILES = 10


class ActivityCreate(BaseModel):
    kind: Literal["change_request", "comment"]
    body: str = Field(default="", max_length=MAX_HTML)  # HTML from the rich editor
    file_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_FILES)
    parent_id: PydanticObjectId | None = None  # reply to this entry
    assigned_to: PydanticObjectId | None = None  # comments only


class ResolvedSet(BaseModel):
    resolved: bool


class ReactionToggle(BaseModel):
    emoji: str = Field(max_length=8)


class ReactionOut(BaseModel):
    emoji: str
    user_ids: list[PydanticObjectId]


class ActivityOut(BaseModel):
    id: PydanticObjectId
    task_id: PydanticObjectId | None
    subfolder_id: PydanticObjectId
    kind: ActivityKind
    body: str
    text: str
    files: list[FileOut]
    author: UserBrief | None
    mentions: list[PydanticObjectId]
    assigned_to: UserBrief | None
    resolved: bool
    resolved_by: UserBrief | None
    resolved_at: datetime | None
    reactions: list[ReactionOut]
    parent_id: PydanticObjectId | None
    created_at: datetime
    can_resolve: bool
    can_delete: bool


class ActivityList(BaseModel):
    items: list[ActivityOut]  # oldest first; replies follow their parent by `parent_id`
    unresolved: int  # open mid-way changes
