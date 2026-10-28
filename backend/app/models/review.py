from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

ReviewDecision = Literal["pending", "approved", "changes_requested"]


class TaskReview(Document):
    """One submission round of a task. A task has at most one pending round at a time."""

    task_id: PydanticObjectId
    round: int  # 1, 2, 3... per task
    submitted_by: PydanticObjectId
    approver_id: PydanticObjectId  # the head picked on the submit form
    note: str
    file_ids: list[PydanticObjectId] = Field(default_factory=list)
    decision: ReviewDecision = "pending"
    comments: str | None = None
    decided_by: PydanticObjectId | None = None  # the approver, or an admin stepping in
    decided_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "task_reviews"
        indexes = [
            IndexModel([("task_id", 1), ("round", 1)], unique=True),
            IndexModel([("approver_id", 1), ("decision", 1)]),
            IndexModel([("decision", 1), ("created_at", -1)]),
        ]
