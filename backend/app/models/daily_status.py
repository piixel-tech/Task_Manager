from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

DayStatus = Literal["present", "wfh", "half_day", "leave"]


class DailyStatus(Document):
    user_id: PydanticObjectId
    date: str  # YYYY-MM-DD in the office timezone
    status: DayStatus
    set_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "daily_status"
        indexes = [IndexModel([("user_id", 1), ("date", 1)], unique=True)]
