import re
from datetime import date, datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator, model_validator

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
    title: str = ""  # job title from their profile
    status: DayStatus | None
    set_at: datetime | None = None
    # Head of at least one subfolder (head is per subfolder, never an account role).
    is_head: bool = False


EMAIL = re.compile(r"^[^@\s<>,;\"']+@[^@\s<>,;\"']+\.[^@\s<>,;\"']+$")


class AttendeeIn(BaseModel):
    """Exactly one of: a teammate (`user_id`) or an email address."""

    user_id: PydanticObjectId | None = None
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if not EMAIL.match(v):
            raise ValueError("That doesn't look like an email address")
        return v

    @model_validator(mode="after")
    def _one(self):
        if (self.user_id is None) == (self.email is None):
            raise ValueError("Give either a teammate or an email address")
        return self


class AttendeeOut(BaseModel):
    email: str
    name: str = ""
    user_id: PydanticObjectId | None = None


class BookingCreate(BaseModel):
    host_user_id: PydanticObjectId
    start: datetime
    end: datetime
    title: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=2000)
    attendees: list[AttendeeIn] = Field(default_factory=list, max_length=20)

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
    meet_url: str = ""
    attendees: list[AttendeeOut] = Field(default_factory=list)
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
