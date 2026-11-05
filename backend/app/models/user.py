from datetime import datetime, timezone
from typing import Annotated, Literal

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field

Role = Literal["admin", "employee", "client"]


class User(Document):
    name: str
    email: Annotated[str, Indexed(unique=True)]
    password_hash: str
    role: Role
    company_id: PydanticObjectId | None = None
    avatar_url: str | None = None
    title: str = ""
    phone: str = ""
    bio: str = ""
    must_change_password: bool = False  # set when an admin creates the account with a temporary password
    sessions_revoked_before: datetime | None = None  # "log out everywhere": older sign-ins without a session record stop working
    settings: dict = Field(default_factory=dict)  # theme, density, sound, notification preferences
    is_active: bool = True
    focus_until: datetime | None = None  # Focus mode: quiet until then
    custom_themes: list[dict] = Field(default_factory=list)  # up to 5 themes this person built (routers/themes.py)
    mutes: dict[str, str] = Field(default_factory=dict)  # "chat:<id>" / "subfolder:<id>" -> ISO time it ends, or "always"
    sidebar_state: dict = Field(default_factory=dict)  # which sidebar nodes are open, and their order
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"
