"""The signed-in person's own account: profile, settings and password."""
import re

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator

from app.core.deps import bearer, get_current_user, user_for_token
from app.core.security import hash_password, verify_password
from app.models import File, Session, User
from app.schemas.user import UserOut
from app.services.prefs import UserSettings
from app.services.themes import CUSTOM_PALETTE

router = APIRouter(prefix="/me", tags=["me"])

MAX_PHOTO_BYTES = 2 * 1024 * 1024
_PHOTO = re.compile(r"^/api/v1/files/([0-9a-f]{24})/download$")
_PRESETS = ("initials:", "icon:", "emoji:")


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    title: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=300)  # a preset (emoji / icon / initials), an uploaded photo, or "" to clear

    @field_validator("name", "title", "phone", "bio")
    @classmethod
    def _tidy(cls, v: str | None) -> str | None:
        return None if v is None else v.strip()


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


@router.patch("/profile", response_model=UserOut)
async def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user)) -> User:
    """Your name, job title, phone, bio and photo. Role, email and company are changed by an admin."""
    data = body.model_dump(exclude_unset=True)
    if data.get("name") == "":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Your name can't be empty")
    if "avatar_url" in data:
        data["avatar_url"] = await _check_avatar(data["avatar_url"], user)
    for field, value in data.items():
        setattr(user, field, value if value is not None else "")
    if "avatar_url" in data and not data["avatar_url"]:
        user.avatar_url = None
    await user.save()
    return user


async def _check_avatar(value: str | None, user: User) -> str | None:
    if not value:
        return None
    if value.startswith(_PRESETS):
        return value
    found = _PHOTO.match(value)
    f = await File.get(PydanticObjectId(found.group(1))) if found else None
    if f is None or f.owner_id != user.id or f.kind != "upload" or not f.mime.startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Upload a picture first, then choose it as your photo")
    if f.size > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a photo under 2 MB")
    return value


@router.put("/settings", response_model=UserSettings)
async def save_settings(body: UserSettings, user: User = Depends(get_current_user)) -> UserSettings:
    """Appearance, sound and which notifications you want. Notifications you switch off are not saved or shown at all."""
    if CUSTOM_PALETTE.match(body.palette):
        from app.routers.themes import can_use  # a custom theme must be yours, or shared with you

        if not await can_use(user, body.palette.split(":", 1)[1]):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That theme isn't available to you")
    user.settings = body.model_dump()
    await user.save()
    return body


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange, user: User = Depends(get_current_user), creds: HTTPAuthorizationCredentials | None = Depends(bearer)
) -> None:
    """Needs your current password. Every other device is signed out; this one stays."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is not right")
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a password you have not used just now")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    await user.save()
    found = await user_for_token(creds.credentials if creds else None)
    keep = found[1].get("sid") if found else None
    others: dict = {"user_id": user.id, "revoked": False}
    if keep and PydanticObjectId.is_valid(keep):
        others["_id"] = {"$ne": PydanticObjectId(keep)}
    await Session.find(others).update({"$set": {"revoked": True}})
