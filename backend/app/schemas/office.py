from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

from app.models.office import REACTIONS, Category
from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_TEXT = 1000
MAX_SEEN_BATCH = 100


class PostCreate(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    category: Category | None = None  # optional: the form no longer asks; missing means "general"
    photo_id: PydanticObjectId | None = None

    @field_validator("text")
    @classmethod
    def _text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be empty")
        return v


class ResolveSet(BaseModel):
    resolved: bool


class ReactionSet(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def _emoji(cls, v: str) -> str:
        if v not in REACTIONS:
            raise ValueError(f"Pick one of {' '.join(REACTIONS)}")
        return v


class SeenBody(BaseModel):
    ids: list[PydanticObjectId] = Field(min_length=1, max_length=MAX_SEEN_BATCH)


class ReactionOut(BaseModel):
    emoji: str
    count: int
    mine: bool
    users: list[UserBrief]


class PostOut(BaseModel):
    id: PydanticObjectId
    author: UserBrief | None
    text: str
    category: Category
    category_label: str
    emoji: str
    photo: FileOut | None
    reactions: list[ReactionOut]  # only emojis somebody used
    seen_by: list[UserBrief]
    seen_count: int
    is_new: bool  # not yours and you haven't viewed it yet
    resolved: bool
    resolved_by: UserBrief | None
    resolved_at: datetime | None
    can_resolve: bool  # the author or an admin
    created_at: datetime


class PostList(BaseModel):
    total: int  # matching the filters, across all pages
    unseen_count: int
    items: list[PostOut]


class OfficeSummary(BaseModel):
    unseen_count: int
    open_count: int
    latest: list[PostOut]  # newest unresolved posts


class SeenOut(BaseModel):
    unseen_count: int


Status = Literal["open", "resolved", "all"]
