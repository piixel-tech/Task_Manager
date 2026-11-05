from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel


class ReportPerson(BaseModel):
    id: PydanticObjectId
    name: str
    company: str = ""
    role: str = "employee"


class AttendanceDay(BaseModel):
    date: str
    status: Literal["present", "wfh", "half_day", "leave"]
    login_time: str | None = None  # HH:MM in the office timezone: when the status was first set that day


class Attendance(BaseModel):
    present: int = 0
    wfh: int = 0
    leave: int = 0
    half_day: int = 0
    avg_login: str | None = None  # HH:MM
    earliest_login: str | None = None  # HH:MM
    latest_login: str | None = None  # HH:MM
    scheduled_days: int = 0  # working days so far this month (weekly offs and holidays taken out); 0 in older snapshots
    off_dates: list[str] = []  # the month's weekly offs and holidays, so the page can fade them
    days: list[AttendanceDay] = []


class TaskTotals(BaseModel):
    assigned: int = 0
    completed: int = 0
    early: int = 0
    on_time: int = 0
    late: int = 0
    pending: int = 0  # not done, and not due yet (or no due date)
    overdue: int = 0  # not done, and the due date has passed


class TimeTotals(BaseModel):
    total_seconds: int = 0
    avg_seconds_per_day: int = 0
    working_days: int = 0


class TopTask(BaseModel):
    task_id: PydanticObjectId
    title: str
    seconds: int


class Previous(BaseModel):
    """The month before, for the small \"vs last month\" lines."""

    days_worked: int = 0
    avg_login: str | None = None
    completed: int = 0
    total_seconds: int = 0


class TimeSpent(BaseModel):
    task_id: PydanticObjectId
    title: str
    seconds: int


class DaySeconds(BaseModel):
    date: str
    seconds: int


class ProjectSeconds(BaseModel):
    name: str  # project / subfolder
    seconds: int


class ReportFile(BaseModel):
    name: str
    kind: Literal["upload", "link"]
    url: str | None = None  # links only: uploads are not reachable without signing in


class TaskRow(BaseModel):
    task_id: PydanticObjectId
    title: str
    description: str  # about 80 characters
    project: str
    subfolder: str
    start: str | None
    due: str | None
    completed: str | None
    result: Literal["Early", "On time", "Late", "Overdue", "Pending"]
    late_days: int = 0  # done after the due date by this many days
    early_days: int = 0  # done before the due date by this many days
    overdue_days: int = 0  # not done, and past the due date by this many days
    seconds: int = 0  # tracked by this person on it during the month
    changes: int = 0
    last_change_resolved: str | None = None
    files: list[ReportFile] = []


class ReportOut(BaseModel):
    person: ReportPerson
    month: str  # YYYY-MM
    state: Literal["in_progress", "final"]
    generated_at: datetime
    attendance: Attendance
    tasks: TaskTotals
    time: TimeTotals
    changes_requested: int = 0
    top_tasks: list[TopTask] = []
    time_by_day: list[DaySeconds] = []  # time tracked on each day (older snapshots: empty)
    time_by_project: list[ProjectSeconds] = []  # time tracked per project / subfolder, longest first
    time_spent: list[TimeSpent] = []  # every task with time tracked this month, longest first
    previous: Previous | None = None
    summary: str = ""  # the plain-English sentence; made when the report is read, never stored
    rows: list[TaskRow] = []


class ReportListRow(BaseModel):
    """One employee in the admin's list for a month."""

    user_id: PydanticObjectId
    name: str
    company: str = ""
    state: Literal["in_progress", "final"]
    present: int = 0
    wfh: int = 0
    leave: int = 0
    half_day: int = 0
    completed: int = 0
    assigned: int = 0
    days_worked: int = 0
    scheduled_days: int = 0
    avg_login: str | None = None
    summary: str = ""
    on_time_pct: int | None = None  # of completed tasks, the share that were early or on time
    total_seconds: int = 0


class ReportList(BaseModel):
    month: str
    rows: list[ReportListRow]
