from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator

from app.core.deps import get_current_user
from app.core.timeutil import as_utc
from app.models import User
from app.services.chat import publish
from app.services.focus import in_focus

router = APIRouter(prefix="/focus", tags=["focus"])

MAX_FOCUS = timedelta(days=7)


class FocusSet(BaseModel):
    """Either a length in minutes, or the moment to stay quiet until."""

    minutes: int | None = Field(default=None, ge=1, le=7 * 24 * 60)
    until: datetime | None = None

    @model_validator(mode="after")
    def _one(self) -> "FocusSet":
        if (self.minutes is None) == (self.until is None):
            raise ValueError("Send either minutes or until")
        return self


class FocusOut(BaseModel):
    focus_until: datetime | None


async def _tell_everyone(user: User) -> None:
    people = await User.find({"is_active": True}).to_list()
    await publish(
        [p.id for p in people],
        "focus:changed",
        {"user_id": str(user.id), "focus_until": as_utc(user.focus_until).isoformat() if in_focus(user) else None},
    )


@router.put("", response_model=FocusOut)
async def start_focus(body: FocusSet, user: User = Depends(get_current_user)) -> FocusOut:
    """Quiet until then. Others see a moon on your avatar. Starting again simply replaces the end time."""
    now = datetime.now(timezone.utc)
    until = now + timedelta(minutes=body.minutes) if body.minutes else as_utc(body.until)
    if until <= now:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a time in the future")
    if until - now > MAX_FOCUS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Focus can last at most 7 days")
    user.focus_until = until
    await user.save()
    await _tell_everyone(user)
    return FocusOut(focus_until=until)


@router.delete("", response_model=FocusOut)
async def end_focus(user: User = Depends(get_current_user)) -> FocusOut:
    user.focus_until = None
    await user.save()
    await _tell_everyone(user)
    return FocusOut(focus_until=None)
