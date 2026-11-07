from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel

from app.schemas.calendar import BookingOut
from app.schemas.chat import ApprovalItem
from app.schemas.project import UserBrief


class TaskCounts(BaseModel):
    overdue: int
    due_today: int
    in_review: int
    running: int  # timers running right now
    open: int
    total: int


class ProjectHealth(BaseModel):
    id: PydanticObjectId
    name: str
    open: int
    overdue: int
    in_review: int
    changes_requested: int
    total: int
    progress: int  # 0-100: approved tasks out of all tasks


class WorkloadRow(BaseModel):
    user: UserBrief
    open: int
    overdue: int


class AdminDashboard(BaseModel):
    tasks: TaskCounts
    projects: list[ProjectHealth]
    approvals: list[ApprovalItem]  # oldest first, only groups the admin is in
    workload: list[WorkloadRow]
    meetings: list[BookingOut]  # today
