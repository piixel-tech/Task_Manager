from datetime import date, datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

from app.models.task import Priority, TaskStatus
from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_ASSETS = 20


def _clean_date(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError("dates must be YYYY-MM-DD")


class TaskCreate(BaseModel):
    subfolder_id: PydanticObjectId
    title: str = Field(min_length=1, max_length=200)
    description: str  # required: a task without a description is rejected
    html: bool = False  # description is HTML from the rich editor
    from_message_id: PydanticObjectId | None = None  # created from this chat message
    assignee_id: PydanticObjectId
    start_date: str | None = None
    due_date: str | None = None
    priority: Priority = "medium"
    asset_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_ASSETS)

    @field_validator("title", "description")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be empty")
        return v

    @field_validator("start_date", "due_date")
    @classmethod
    def _due(cls, v: str | None) -> str | None:
        return _clean_date(v)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    html: bool = False  # the new description is HTML from the rich editor
    assignee_id: PydanticObjectId | None = None
    start_date: str | None = None  # send "" to clear
    due_date: str | None = None  # send "" to clear
    priority: Priority | None = None
    asset_ids: list[PydanticObjectId] | None = Field(default=None, max_length=MAX_ASSETS)

    @field_validator("title", "description")
    @classmethod
    def _not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("must not be empty")
        return v

    @field_validator("start_date", "due_date")
    @classmethod
    def _due(cls, v: str | None) -> str | None:
        return _clean_date(v) if v is not None else None


class ProgressSet(BaseModel):
    progress: int = Field(ge=0, le=99, description="0-99. Approval sets 100.")


class TaskSource(BaseModel):
    group_id: PydanticObjectId
    group_name: str
    message_id: PydanticObjectId


class TaskOut(BaseModel):
    id: PydanticObjectId
    project_id: PydanticObjectId
    project_name: str
    subfolder_id: PydanticObjectId
    subfolder_name: str
    title: str
    description: str  # HTML when description_html
    description_html: bool = False
    description_text: str = ""
    source: "TaskSource | None" = None  # the chat message it was created from (only if the viewer is in that chat)
    unresolved_changes: int = 0  # open mid-way changes, for the badge on task cards
    assignee: UserBrief | None
    created_by: UserBrief | None
    start_date: str | None = None
    due_date: str | None
    priority: Priority
    status: TaskStatus
    progress: int
    assets: list[FileOut]
    total_seconds: int  # includes a running session
    timer_running: bool
    timer_started_at: datetime | None
    created_at: datetime
    can_edit: bool  # details, assets, reassign, delete
    can_work: bool  # progress and timer (the assignee, while the task is open)
    pending_review_id: PydanticObjectId | None = None  # the submission awaiting a decision
    can_review: bool = False  # the viewer may approve / request changes on it
    review_rounds: int = 0


class TimeLogOut(BaseModel):
    id: PydanticObjectId
    task_id: PydanticObjectId
    user_id: PydanticObjectId
    started_at: datetime
    ended_at: datetime | None
    seconds: int
    running: bool


class TimerResult(BaseModel):
    task: TaskOut
    stopped_task_id: PydanticObjectId | None = None  # another timer that was stopped to start this one


class TimerTask(BaseModel):
    id: PydanticObjectId
    title: str
    subfolder_id: PydanticObjectId
    progress: int = 0
    total_seconds: int  # everything tracked on it, a running session included


class WorkingNow(BaseModel):
    """Someone with a timer running on a task of the subfolder."""

    task_id: PydanticObjectId
    started_at: datetime
    user: UserBrief


class TimerLogEntry(BaseModel):
    """One timer session of a task: from play (or resume) to pause. `ended_at` is empty while it runs."""

    id: PydanticObjectId
    user: UserBrief
    started_at: datetime
    ended_at: datetime | None
    seconds: int  # 0 while running: the screen counts from started_at and server_now
    running: bool


class TimerLogOut(BaseModel):
    server_now: datetime
    total_seconds: int  # every finished session plus the running one, up to server_now
    entries: list[TimerLogEntry]  # newest first


class TimerStart(BaseModel):
    task_id: PydanticObjectId


class TimerCurrent(BaseModel):
    """Where the person's timer is. All times come from the server, so a browser can show the clock but never decides it."""

    server_now: datetime
    state: Literal["running", "paused", "idle"]
    task: TimerTask | None = None  # the running task, or the one that would resume
    started_at: datetime | None = None  # when the running session began
    stopped_task: TimerTask | None = None  # the timer this call closed (Play on another task)


class ReminderRun(BaseModel):
    day: str
    sent: int


class ActiveTimerTask(BaseModel):
    id: PydanticObjectId
    title: str
    description: str  # plain text, shortened for a list row
    due_date: str | None
    priority: Literal["low", "medium", "high", "urgent"]
    status: str
    total_seconds: int  # everything tracked on the task as of `server_now`, the running session included (what the task page shows)
    project_id: PydanticObjectId
    project_name: str
    subfolder_id: PydanticObjectId
    subfolder_name: str


class ActiveTimer(BaseModel):
    """One person with a timer running right now, with the task they are on."""

    user: UserBrief
    company_id: PydanticObjectId | None
    started_at: datetime
    task: ActiveTimerTask


class ActiveCompany(BaseModel):
    id: PydanticObjectId
    name: str


class ActiveTimers(BaseModel):
    """Everyone working right now (admin dashboard). `companies` lists every company so an empty one can still say so."""

    server_now: datetime
    companies: list[ActiveCompany]
    items: list[ActiveTimer]
