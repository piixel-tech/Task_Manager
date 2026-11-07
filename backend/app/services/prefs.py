"""Per-person preferences: what they want to be told about, and how the app should look."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import User
from app.services.themes import CUSTOM_PALETTE


class NotifPrefs(BaseModel):
    tasks: bool = True
    reviews: bool = True
    chat: bool = True
    mentions: bool = True
    office: bool = True
    bookings: bool = True


BUILT_IN_PALETTES = (
    "purple", "indigo", "blue", "sky", "teal", "green", "red", "coral", "pink", "orange", "gold", "brown", "olive", "grey", "monochrome"
)
_PALETTES = set(BUILT_IN_PALETTES)


def _known_palette(v: str) -> bool:
    """A built-in theme, or a custom one ("custom:<id>"; routers/me.py checks the person may use it)."""
    return v in _PALETTES or bool(CUSTOM_PALETTE.match(v))


def clean_stored(settings):
    """Stored settings with a theme that no longer exists swapped for purple (saving still rejects unknown ones)."""
    if isinstance(settings, dict) and not _known_palette(str(settings.get("palette"))):
        return {**settings, "palette": "purple"} if "palette" in settings else settings
    return settings


class UserSettings(BaseModel):
    theme: Literal["light", "dark", "system"] = "light"  # light / dark mode (light unless the person picks otherwise)
    palette: str = "purple"  # colour theme: a built-in name, or "custom:<id>"
    density: Literal["comfortable", "compact"] = "comfortable"
    sound: bool = True
    # Notification alerts: which sound, how loud (0-100), muted, and OS popups when the tab is hidden.
    alert_sound: Literal["chime", "ding", "pop", "bell", "drop", "soft"] = "chime"
    alert_sound_important: Literal["chime", "ding", "pop", "bell", "drop", "soft"] = "bell"
    alert_volume: int = Field(default=70, ge=0, le=100)
    alert_muted: bool = False
    desktop_popups: bool = False
    notif_prefs: NotifPrefs = NotifPrefs()

    @field_validator("palette")
    @classmethod
    def _palette(cls, v: str) -> str:
        if not _known_palette(v):
            raise ValueError("Unknown theme")
        return v


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
        return UserSettings.model_validate(clean_stored(user.settings or {}))
    except ValueError:
        return UserSettings()


def wants(user: User, notification_type: str) -> bool:
    category = category_of(notification_type)
    return True if category is None else bool(getattr(settings_of(user).notif_prefs, category))
