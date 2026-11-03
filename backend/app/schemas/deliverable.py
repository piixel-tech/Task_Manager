from datetime import datetime
import re

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

from app.models.deliverable import MAX_STAGES, MIN_STAGES
from app.schemas.project import UserBrief

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MAX_TYPES = 20
MAX_COUNT = 200


class CountsSet(BaseModel):
    counts: dict[str, int]  # {"Reels": 12, "Creatives": 8}

    @field_validator("counts")
    @classmethod
    def _counts(cls, v: dict[str, int]) -> dict[str, int]:
        if not v:
            raise ValueError("Give at least one type")
        if len(v) > MAX_TYPES:
            raise ValueError(f"At most {MAX_TYPES} types")
        clean: dict[str, int] = {}
        for name, n in v.items():
            name = " ".join(name.split())
            if not name or len(name) > 40:
                raise ValueError("Type names must be 1-40 characters")
            if name.lower() in {k.lower() for k in clean}:
                raise ValueError(f"Duplicate type: {name}")
            if not 0 <= n <= MAX_COUNT:
                raise ValueError(f"Counts must be between 0 and {MAX_COUNT}")
            clean[name] = n
        return clean


def clean_type_name(name: str) -> str:
    name = " ".join(name.split())
    if not name or len(name) > 40:
        raise ValueError("Type names must be 1-40 characters")
    return name


class ItemsAdd(BaseModel):
    """Add `count` more items to a type (new or existing); numbering carries on from the highest."""

    type: str
    count: int = Field(default=1, ge=1, le=MAX_COUNT)

    clean_type = field_validator("type")(clean_type_name)


class StageSet(BaseModel):
    stage: str


class StageIn(BaseModel):
    """One stage in the new list. A `key` keeps an existing stage (a rename or a move); no key makes a new one."""

    key: str | None = None
    label: str

    @field_validator("label")
    @classmethod
    def _label(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v or len(v) > 30:
            raise ValueError("Stage names must be 1-30 characters")
        return v


class StagesSet(BaseModel):
    """The whole list of stages, in order. Stages left out are deleted; items on them move to the stage before."""

    stages: list[StageIn]
    move_items: bool = False  # confirm that items sitting on deleted stages may be moved

    @field_validator("stages")
    @classmethod
    def _stages(cls, v: list[StageIn]) -> list[StageIn]:
        if not MIN_STAGES <= len(v) <= MAX_STAGES:
            raise ValueError(f"Between {MIN_STAGES} and {MAX_STAGES} stages")
        names = [s.label.lower() for s in v]
        if len(set(names)) != len(names):
            raise ValueError("Two stages have the same name")
        return v


class StagesUsage(BaseModel):
    counts: dict[str, int]  # items on each stage key, across every month


class DeliverableItemOut(BaseModel):
    id: str
    type: str
    number: int
    title: str
    stage: str
    updated_by: UserBrief | None
    updated_at: datetime


class TypeSummary(BaseModel):
    type: str
    total: int
    by_stage: dict[str, int]  # every stage present, zeros included
    done: int  # items that reached the last stage (posted)
    remaining: int  # total - done
    progress: int  # 0-100


class DeliverablesOut(BaseModel):
    subfolder_id: PydanticObjectId
    month: str
    stages: list[str]  # keys, in order; the last one is the finish line
    stage_labels: dict[str, str] = {}  # key -> name
    total: int
    done: int
    remaining: int
    progress: int  # 0-100: average position of the items along the stages
    by_stage: dict[str, int]
    types: list[TypeSummary]
    items: list[DeliverableItemOut]
    can_set_counts: bool  # heads and admins
    can_set_stage: bool  # any member
