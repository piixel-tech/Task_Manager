from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

from app.models.review import ReviewDecision
from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_FILES = 20


def _text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


class ReviewSubmit(BaseModel):
    note: str  # required: say what was done
    approver_id: PydanticObjectId
    file_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_FILES)

    @field_validator("note")
    @classmethod
    def _note(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be empty")
        return v


class ApproveBody(BaseModel):
    comments: str | None = None  # optional praise / notes

    @field_validator("comments")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return _text(v)


class ChangesBody(BaseModel):
    comments: str  # required: the employee needs to know what to fix

    @field_validator("comments")
    @classmethod
    def _comments(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be empty")
        return v


class ReviewOut(BaseModel):
    id: PydanticObjectId
    task_id: PydanticObjectId
    task_title: str
    project_id: PydanticObjectId | None
    project_name: str
    subfolder_name: str
    round: int
    submitted_by: UserBrief | None
    approver: UserBrief | None
    note: str
    files: list[FileOut]
    decision: ReviewDecision
    comments: str | None
    decided_by: UserBrief | None
    decided_at: datetime | None
    created_at: datetime
    can_decide: bool  # pending, and the viewer is the picked approver (or an admin)
