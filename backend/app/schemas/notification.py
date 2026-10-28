from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: PydanticObjectId
    user_id: PydanticObjectId
    type: str
    title: str
    body: str
    link: str | None
    actor_id: PydanticObjectId | None
    read: bool
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    limit: int
    skip: int


class UnreadCount(BaseModel):
    count: int


class MarkRead(BaseModel):
    """Mark specific notifications read, or everything with all=true."""

    ids: list[PydanticObjectId] | None = None
    all: bool = False


class MarkReadResult(BaseModel):
    updated: int


class TestNotification(BaseModel):
    user_id: PydanticObjectId
    title: str = Field(default="Test notification", max_length=200)
    body: str = "This is a test notification."
    link: str | None = None
