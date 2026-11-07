from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

LeaveType = Literal["leave", "wfh"]
LeaveDuration = Literal["full", "first_half", "second_half"]
LeaveStatus = Literal["pending", "approved", "rejected"]


class LeaveRequest(Document):
    """An employee's request for leave or to work from home, sent to one admin of their company."""

    user_id: PydanticObjectId
    company_id: PydanticObjectId
    type: LeaveType
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD, never before start_date
    duration: LeaveDuration = "full"  # a half day only when start_date == end_date
    reason: str
    admin_id: PydanticObjectId  # the admin it was sent to; only they can decide it
    status: LeaveStatus = "pending"
    reject_reason: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decided_at: datetime | None = None
    decided_by: PydanticObjectId | None = None

    class Settings:
        name = "leave_requests"
        indexes = [
            IndexModel([("user_id", 1), ("status", 1)]),
            IndexModel([("admin_id", 1), ("status", 1), ("created_at", -1)]),
        ]
