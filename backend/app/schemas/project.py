from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    id: PydanticObjectId
    name: str
    avatar_url: str | None = None
    role: str
    company_id: PydanticObjectId | None = None
    focus_until: datetime | None = None  # set only while they are in Focus mode


class SubfolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    head_ids: list[PydanticObjectId] = Field(min_length=1)
    member_ids: list[PydanticObjectId] = Field(default_factory=list)


class SubfolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    head_ids: list[PydanticObjectId] | None = Field(default=None, min_length=1)
    member_ids: list[PydanticObjectId] | None = None


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


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company_id: PydanticObjectId
    client_ids: list[PydanticObjectId] = Field(default_factory=list)
    first_subfolder: SubfolderCreate


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    company_id: PydanticObjectId | None = None
    client_ids: list[PydanticObjectId] | None = None


class ProjectOut(BaseModel):
    id: PydanticObjectId
    name: str
    company_id: PydanticObjectId
    client_ids: list[PydanticObjectId]
    created_by: PydanticObjectId
    created_at: datetime
    subfolder_count: int
    can_edit: bool
    can_create_subfolder: bool


class ProjectDetail(ProjectOut):
    clients: list[UserBrief]
    subfolders: list[SubfolderOut]
