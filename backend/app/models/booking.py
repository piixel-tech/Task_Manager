from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Booking(Document):
    host_user_id: PydanticObjectId
    booked_by: PydanticObjectId
    start: datetime
    end: datetime
    title: str
    note: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "bookings"
        indexes = [IndexModel([("host_user_id", 1), ("start", 1)])]
