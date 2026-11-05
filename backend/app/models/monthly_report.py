from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class MonthlyReport(Document):
    """A finished month of one employee, frozen: once saved it is never rebuilt, so later changes to tasks or attendance do not touch it."""

    user_id: PydanticObjectId
    month: str  # YYYY-MM
    data: dict  # the report as the API returns it (schemas/report.py ReportOut)
    finalized_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "monthly_reports"
        indexes = [IndexModel([("user_id", 1), ("month", 1)], unique=True)]
