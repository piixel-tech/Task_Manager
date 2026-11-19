from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import Role
from app.services.prefs import UserSettings, clean_stored


class UserOut(BaseModel):
    id: PydanticObjectId
    name: str
    email: str
    role: Role
    company_id: PydanticObjectId | None
    avatar_url: str | None
    title: str = ""
    phone: str = ""
    bio: str = ""
    birthday: str = ""
    birth_year: int | None = None  # only ever returned to the person themselves and to admins
    joined_on: str = ""  # empty = the day the account was made
    must_change_password: bool = False
    settings: UserSettings = Field(default_factory=UserSettings)
    is_active: bool
    focus_until: datetime | None = None
    sidebar_state: dict = Field(default_factory=dict)
    created_at: datetime

    @field_validator("settings", mode="before")
    @classmethod
    def _fallback_theme(cls, v):
        return clean_stored(v)


class TeamMember(BaseModel):
    """One person in the team picker (booking guests): who they are, their job and their company."""

    id: PydanticObjectId
    name: str
    avatar_url: str | None = None
    role: str
    title: str = ""
    company_id: PydanticObjectId | None = None
    company_name: str = ""


class PersonProfile(BaseModel):
    """What anyone may see on a person's profile page: no email, phone, settings or login details."""

    id: PydanticObjectId
    name: str
    role: Role
    avatar_url: str | None
    title: str
    bio: str
    birthday: str = ""  # "MM-DD"; the birth year is never shown
    joined_on: str = ""
    company: str | None
    status: str | None  # today's daily status; only team members have one
    in_focus: bool = False


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: Role
    company_id: PydanticObjectId | None = None
    avatar_url: str | None = None
    title: str = Field(default="", max_length=80)  # job role shown under their name


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)
    role: Role | None = None
    company_id: PydanticObjectId | None = None
    avatar_url: str | None = None
    is_active: bool | None = None
    title: str | None = Field(default=None, max_length=80)
    birthday: str | None = None  # "MM-DD" or "" to clear
    birth_year: int | None = None
    joined_on: str | None = None  # YYYY-MM-DD or "" to clear


class CompanyOut(BaseModel):
    id: PydanticObjectId
    name: str
