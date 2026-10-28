from datetime import date, datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

from app.core.timeutil import as_utc
from app.models.daily_status import DayStatus


class StatusSet(BaseModel):
    status: DayStatus


class StatusOut(BaseModel):
    user_id: PydanticObjectId
    date: str
    status: DayStatus
    set_at: datetime

    @field_validator("set_at")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return as_utc(v)


class MyToday(BaseModel):
    date: str
    status: DayStatus | None
    set_at: datetime | None = None


class TodayRow(BaseModel):
    """One person on the dashboard's Today overview."""

    user_id: PydanticObjectId
    name: str
    avatar_url: str | None
    company_id: PydanticObjectId | None
    role: str
    status: DayStatus | None
    set_at: datetime | None = None
    # Head of at least one subfolder (head is per subfolder, never an account role).
    is_head: bool = False


class BookingCreate(BaseModel):
    host_user_id: PydanticObjectId
    start: datetime
    end: datetime
    title: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=2000)

    @field_validator("start", "end")
    @classmethod
    def _aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("Datetime must include a timezone offset, e.g. 2026-10-27T10:00:00+05:30")
        return as_utc(v)


class BookingOut(BaseModel):
    id: PydanticObjectId
    host_user_id: PydanticObjectId
    booked_by: PydanticObjectId
    start: datetime
    end: datetime
    title: str
    note: str
    created_at: datetime

    @field_validator("start", "end", "created_at")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return as_utc(v)


class Slot(BaseModel):
    start: datetime
    end: datetime


class Availability(BaseModel):
    host_user_id: PydanticObjectId
    date: str
    minutes: int
    slots: list[Slot]
    note: str | None  # why there are no slots, when that is the case


class DateRange(BaseModel):
    start: date
    end: date
