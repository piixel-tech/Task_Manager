from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def tz() -> ZoneInfo:
    return ZoneInfo(settings.TIMEZONE)


def today_local() -> date:
    return datetime.now(tz()).date()


def to_local_date(moment: datetime) -> date:
    return as_utc(moment).astimezone(tz()).date()


def as_utc(moment: datetime) -> datetime:
    """Mongo hands datetimes back naive (UTC); make everything explicit."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)
