from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import AnyHttpUrl, BaseModel, Field


class FileOut(BaseModel):
    id: PydanticObjectId
    owner_id: PydanticObjectId
    name: str
    mime: str
    size: int
    kind: Literal["upload", "link"]
    url: str
    created_at: datetime


class LinkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: AnyHttpUrl
