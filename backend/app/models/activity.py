from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

ActivityKind = Literal["change_request", "comment", "log"]


class TaskActivity(Document):
    """One entry in a task's Activity panel (or a subfolder's Mid-way changes box when `task_id` is empty)."""

    task_id: PydanticObjectId | None = None
    subfolder_id: PydanticObjectId
    project_id: PydanticObjectId
    kind: ActivityKind
    body: str = ""  # sanitized HTML for change requests and comments; plain text for log lines
    text: str = ""  # plain version, for notifications
    file_ids: list[PydanticObjectId] = Field(default_factory=list)
    author_id: PydanticObjectId
    mentions: list[PydanticObjectId] = Field(default_factory=list)
    assigned_to: PydanticObjectId | None = None  # comments only
    resolved: bool = False
    resolved_by: PydanticObjectId | None = None
    resolved_at: datetime | None = None
    reactions: dict[str, list[PydanticObjectId]] = Field(default_factory=dict)
    parent_id: PydanticObjectId | None = None  # a reply points at its top-level entry
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "task_activity"
        indexes = [IndexModel([("task_id", 1), ("created_at", 1)]), IndexModel([("subfolder_id", 1), ("kind", 1)])]
