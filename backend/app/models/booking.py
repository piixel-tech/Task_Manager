from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import IndexModel


class Attendee(BaseModel):
    """A guest added to a booking: a teammate, or anyone with an email address."""

    email: str
    name: str = ""
    user_id: PydanticObjectId | None = None


class Booking(Document):
    host_user_id: PydanticObjectId
    booked_by: PydanticObjectId
    start: datetime
    end: datetime
    title: str
    note: str = ""
    attendees: list[Attendee] = Field(default_factory=list)  # invited through Google Calendar, besides the host and the booker
    meet_url: str = ""  # the Google Meet link, filled in by the first connected person's calendar push
    meet_owner_id: PydanticObjectId | None = None  # whose Google event holds the Meet (the others get the link as text)
    remind_sent: bool = False  # the "starts in 10 minutes" notification went out
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "bookings"
        indexes = [IndexModel([("host_user_id", 1), ("start", 1)])]
