from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

ConnectionStatus = Literal["connected", "needs_reconnect"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class IntegrationConnection(Document):
    """One person's link to one third-party app. Tokens are Fernet ciphertext and never leave the backend."""

    user_id: PydanticObjectId
    provider: str  # key in the providers registry, e.g. "google"
    status: ConnectionStatus = "connected"
    account: str = ""  # who they signed in as on the other side (an email)
    access_token: str = ""  # encrypted
    refresh_token: str = ""  # encrypted
    token_expires_at: datetime | None = None
    scopes: list[str] = Field(default_factory=list)
    config: dict = Field(default_factory=dict)  # provider-specific (Google: calendars, sync tokens, push channels)
    last_sync_at: datetime | None = None
    last_error: str | None = None
    last_error_at: datetime | None = None
    error_notified: bool = False  # the person was told about the current failure
    created_at: datetime = Field(default_factory=_now)

    class Settings:
        name = "integration_connections"
        indexes = [
            IndexModel([("user_id", 1), ("provider", 1)], unique=True),
            IndexModel([("provider", 1), ("config.calendars.channel.id", 1)]),
        ]


class ExternalEvent(Document):
    """An event pulled from another app into one person's calendar. Private to that person; others only see "Busy"."""

    user_id: PydanticObjectId
    provider: str
    calendar_id: str
    external_id: str
    title: str = ""
    location: str = ""
    start: datetime
    end: datetime  # exclusive; all-day events run from local midnight to local midnight
    all_day: bool = False
    busy: bool = True  # false for events marked "free"/declined: shown to the owner, invisible to others
    html_link: str = ""

    class Settings:
        name = "external_events"
        indexes = [
            IndexModel([("user_id", 1), ("provider", 1), ("calendar_id", 1), ("external_id", 1)], unique=True),
            IndexModel([("user_id", 1), ("start", 1)]),
        ]


class IntegrationLink(Document):
    """Remembers which Task Manager item (booking / task due date) is which event on the other side."""

    user_id: PydanticObjectId
    provider: str
    kind: Literal["booking", "task"]
    local_id: PydanticObjectId
    calendar_id: str
    external_id: str
    fingerprint: str  # hash of what was last sent, so unchanged items cost no API call

    class Settings:
        name = "integration_links"
        indexes = [IndexModel([("user_id", 1), ("provider", 1), ("kind", 1), ("local_id", 1)], unique=True)]
