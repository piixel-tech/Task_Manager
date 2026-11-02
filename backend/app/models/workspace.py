from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

HolidayType = Literal["national", "company", "optional"]


class Holiday(BaseModel):
    id: str
    date: str  # YYYY-MM-DD (the first day)
    end_date: str | None = None  # last day of a range; None = a single day
    name: str
    type: HolidayType = "company"
    company_ids: list[PydanticObjectId] = Field(default_factory=list)  # empty = every company


class Workspace(Document):
    """The one settings record for the whole workspace."""

    name: str = "Task Manager"
    logo_file_id: PydanticObjectId | None = None
    work_start: str = "09:00"  # local time (TIMEZONE): when bookable hours open
    work_end: str = "18:00"
    holidays: list[Holiday] = Field(default_factory=list)
    festival: dict | None = None  # the festival theme: name, dates and light/dark palettes (see routers/festival.py)
    weekly_off: list[int] = Field(default_factory=lambda: [6])  # weekdays off every week, Monday=0 .. Sunday=6

    class Settings:
        name = "workspace"
