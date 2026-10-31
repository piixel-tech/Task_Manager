from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

TaskStatus = Literal["todo", "in_progress", "submitted", "changes_requested", "approved"]
Priority = Literal["low", "medium", "high", "urgent"]

# Statuses where the assignee is still expected to deliver (timer, progress, reminders).
OPEN_STATUSES = ("todo", "in_progress", "changes_requested")


class Task(Document):
    subfolder_id: PydanticObjectId
    project_id: PydanticObjectId
    title: str
    description: str  # sanitized HTML when `description_html`
    description_html: bool = False
    source_group_id: PydanticObjectId | None = None  # created from a chat message
    source_message_id: PydanticObjectId | None = None
    assignee_id: PydanticObjectId
    created_by: PydanticObjectId
    start_date: str | None = None  # YYYY-MM-DD, optional
    due_date: str | None = None  # YYYY-MM-DD
    priority: Priority = "medium"
    status: TaskStatus = "todo"
    progress: int = 0  # 0-100; the assignee sets up to 99, approval sets 100
    asset_ids: list[PydanticObjectId] = Field(default_factory=list)
    total_seconds: int = 0  # finished timer sessions; a running one is added on read
    last_reminded_on: str | None = None  # YYYY-MM-DD of the last due-date reminder
    assignee_seen: bool = True  # False from a hand-over by someone else until the assignee opens the task
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "tasks"
        indexes = [
            IndexModel([("subfolder_id", 1)]),
            IndexModel([("project_id", 1)]),
            IndexModel([("assignee_id", 1)]),
        ]


class TimeLog(Document):
    task_id: PydanticObjectId
    user_id: PydanticObjectId
    started_at: datetime
    ended_at: datetime | None = None
    seconds: int = 0
    running: bool = True

    class Settings:
        name = "time_logs"
        indexes = [
            IndexModel([("task_id", 1), ("started_at", -1)]),
            # A person can only have one running timer at a time.
            IndexModel([("user_id", 1)], unique=True, partialFilterExpression={"running": True}),
        ]
