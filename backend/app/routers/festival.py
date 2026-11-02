"""Festival theme: the admin picks a festival (or makes a custom one) and its dates; during those dates every
signed-in person sees its palette and a small banner, unless they switch back to their own theme."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.deps import get_current_user, require_role
from app.core.timeutil import today_local
from app.models import User
from app.services import festivals
from app.services.chat import publish
from app.services.workspace import get_workspace

router = APIRouter(prefix="/festival", tags=["festival"])

MAX_DAYS = 60


class Palette(BaseModel):
    light: dict[str, str]
    dark: dict[str, str]


class FestivalOut(BaseModel):
    id: str
    name: str
    emoji: str = ""
    greeting: str = ""
    preset: str | None = None
    start_date: str
    end_date: str
    light: dict[str, str]
    dark: dict[str, str]


class AdminFestivalOut(BaseModel):
    festival: FestivalOut | None
    state: str | None  # scheduled | live | ended


class PreviewIn(BaseModel):
    light: dict[str, str]


class FestivalIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    emoji: str = Field(default="", max_length=8)
    greeting: str = Field(default="", max_length=140)
    preset: str | None = None
    start_date: str
    end_date: str
    light: dict[str, str]

    @field_validator("name", "greeting", "emoji")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _dates(self) -> "FestivalIn":
        try:
            start, end = date.fromisoformat(self.start_date), date.fromisoformat(self.end_date)
        except ValueError:
            raise ValueError("Dates must be YYYY-MM-DD")
        if end < start:
            raise ValueError("The end date can't be before the start date")
        if (end - start).days + 1 > MAX_DAYS:
            raise ValueError(f"A festival theme can run for at most {MAX_DAYS} days")
        return self


def _state(f: dict) -> str:
    today = today_local().isoformat()
    return "scheduled" if today < f["start_date"] else "ended" if today > f["end_date"] else "live"


async def _tell_everyone() -> None:
    people = await User.find({"is_active": True}).to_list()
    await publish([p.id for p in people], "festival:changed", {})


@router.get("/active", response_model=FestivalOut | None)
async def active_festival(_: User = Depends(get_current_user)) -> dict | None:
    """The festival theme running today, if any. Ends by itself after its end date."""
    f = (await get_workspace()).festival
    return f if f and _state(f) == "live" else None


@router.get("/presets")
async def preset_list(_: User = Depends(require_role("admin"))) -> list[dict]:
    return festivals.presets()


@router.post("/preview", response_model=Palette)
async def preview(body: PreviewIn, _: User = Depends(require_role("admin"))) -> dict:
    """The light colours made readable, and the dark set derived from them."""
    try:
        return festivals.build(body.light)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


@router.get("", response_model=AdminFestivalOut)
async def current(_: User = Depends(require_role("admin"))) -> AdminFestivalOut:
    f = (await get_workspace()).festival
    return AdminFestivalOut(festival=f, state=_state(f) if f else None)


@router.put("", response_model=AdminFestivalOut)
async def publish_festival(body: FestivalIn, _: User = Depends(require_role("admin"))) -> AdminFestivalOut:
    """Save and publish: it applies for everyone from the start date to the end date."""
    if body.end_date < today_local().isoformat():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The end date is already in the past")
    try:
        pal = festivals.build(body.light)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
    ws = await get_workspace()
    ws.festival = {
        "id": uuid.uuid4().hex,
        "name": body.name,
        "emoji": body.emoji,
        "greeting": body.greeting or f"Happy {body.name}!",
        "preset": body.preset,
        "start_date": body.start_date,
        "end_date": body.end_date,
        **pal,
    }
    await ws.save()
    await _tell_everyone()
    return AdminFestivalOut(festival=ws.festival, state=_state(ws.festival))


@router.delete("", response_model=AdminFestivalOut)
async def end_festival(_: User = Depends(require_role("admin"))) -> AdminFestivalOut:
    ws = await get_workspace()
    ws.festival = None
    await ws.save()
    await _tell_everyone()
    return AdminFestivalOut(festival=None, state=None)
