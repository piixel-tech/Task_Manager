"""Per-person preferences: what they want to be told about, and how the app should look."""
from typing import Literal

from pydantic import BaseModel

from app.models import User


class NotifPrefs(BaseModel):
    tasks: bool = True
    reviews: bool = True
    chat: bool = True
    mentions: bool = True
    office: bool = True
    bookings: bool = True


class UserSettings(BaseModel):
    theme: Literal["light", "dark", "system"] = "system"
    density: Literal["comfortable", "compact"] = "comfortable"
    sound: bool = True
    notif_prefs: NotifPrefs = NotifPrefs()


# Notification type (or its prefix) -> the preference that controls it. Anything not listed is always delivered.
_BY_PREFIX: list[tuple[str, str]] = [
    ("mention", "mentions"),
    ("review_", "reviews"),
    ("chat_", "chat"),
    ("client_approval", "chat"),
    ("approval_", "chat"),
    ("office_", "office"),
    ("booking_", "bookings"),
    ("task_", "tasks"),
    ("change_request", "tasks"),
    ("activity_", "tasks"),
    ("project_", "tasks"),
    ("subfolder_", "tasks"),
    ("head_", "tasks"),
    ("members_", "tasks"),
    ("checklist_", "tasks"),
    ("deliverables_", "tasks"),
    ("requirement_", "tasks"),
]


def category_of(notification_type: str) -> str | None:
    for prefix, category in _BY_PREFIX:
        if notification_type.startswith(prefix):
            return category
    return None


def settings_of(user: User) -> UserSettings:
    """The person's settings with defaults filled in (and anything unrecognised ignored)."""
    try:
        return UserSettings.model_validate(user.settings or {})
    except ValueError:
        return UserSettings()


def wants(user: User, notification_type: str) -> bool:
    category = category_of(notification_type)
    return True if category is None else bool(getattr(settings_of(user).notif_prefs, category))
