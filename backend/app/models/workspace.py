from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

HolidayType = Literal["national", "company", "optional"]


class Holiday(BaseModel):
    id: str
    date: str  # YYYY-MM-DD
    name: str
    type: HolidayType = "company"


class Workspace(Document):
    """The one settings record for the whole workspace."""

    name: str = "Task Manager"
    logo_file_id: PydanticObjectId | None = None
    work_start: str = "09:00"  # local time (TIMEZONE): when bookable hours open
    work_end: str = "18:00"
    holidays: list[Holiday] = Field(default_factory=list)

    class Settings:
        name = "workspace"
