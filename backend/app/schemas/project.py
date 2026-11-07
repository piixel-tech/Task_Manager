from datetime import date, datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    id: PydanticObjectId
    name: str
    avatar_url: str | None = None
    role: str
    company_id: PydanticObjectId | None = None
    focus_until: datetime | None = None  # set only while they are in Focus mode


class ViewerCandidate(UserBrief):
    """A person who could be picked to view a subfolder."""

    email: str


class SubfolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    head_ids: list[PydanticObjectId] = Field(min_length=1)
    member_ids: list[PydanticObjectId] = Field(default_factory=list)


class SubfolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    head_ids: list[PydanticObjectId] | None = Field(default=None, min_length=1)
    member_ids: list[PydanticObjectId] | None = None


class SubfolderVisibility(BaseModel):
    visibility: Literal["hidden", "everyone", "selected"]
    viewer_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=200)  # who is picked, for "selected"


class SubfolderOut(BaseModel):
    id: PydanticObjectId
    project_id: PydanticObjectId
    name: str
    heads: list[UserBrief]
    members: list[UserBrief]  # includes the heads
    created_by: PydanticObjectId
    created_at: datetime
    # What the signed-in user may do here (drives read-only vs editable UI).
    can_edit: bool
    viewer_is_head: bool
    visibility: Literal["hidden", "everyone", "selected"] = "hidden"
    viewers: list[UserBrief] = Field(default_factory=list)  # the picked people; only sent to whoever can change visibility
    can_set_visibility: bool = False  # admins and the heads of this subfolder
    can_work: bool = False  # false for someone who can only read it (not a member)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company_id: PydanticObjectId
    company_ids: list[PydanticObjectId] | None = None  # all companies (first wins as the main one); omit for just `company_id`
    start_date: date | None = None
    description: str = Field(default="", max_length=200)
    client_ids: list[PydanticObjectId] = Field(default_factory=list)
    first_subfolder: SubfolderCreate


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    company_id: PydanticObjectId | None = None
    company_ids: list[PydanticObjectId] | None = Field(default=None, min_length=1)
    start_date: date | None = None
    description: str | None = Field(default=None, max_length=200)
    client_ids: list[PydanticObjectId] | None = None


class ProjectOut(BaseModel):
    id: PydanticObjectId
    name: str
    company_id: PydanticObjectId
    company_ids: list[PydanticObjectId]  # every company the project belongs to (main one first)
    start_date: str | None = None
    description: str = ""
    client_ids: list[PydanticObjectId]
    created_by: PydanticObjectId
    created_at: datetime
    subfolder_count: int
    can_edit: bool
    can_create_subfolder: bool


class ProjectDetail(ProjectOut):
    clients: list[UserBrief]
    subfolders: list[SubfolderOut]
