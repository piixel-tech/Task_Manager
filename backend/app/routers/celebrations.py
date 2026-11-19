"""Celebrations: today's birthdays and work milestones for the team, and the festival greetings admins add."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, require_role
from app.core.timeutil import today_local
from app.models import User
from app.services import celebrations
from app.services.workspace import get_workspace

router = APIRouter(prefix="/celebrations", tags=["celebrations"])

MAX_FESTIVALS = 100


class Celebration(BaseModel):
    user_id: str
    name: str
    avatar_url: str | None = None
    kind: str  # birthday | milestone
    label: str
    months: int | None = None  # milestones: months of work
    duration: str | None = None  # milestones: "1 year"
    company: str | None = None  # their company's name


class FestivalGreeting(BaseModel):
    id: str
    name: str
    date: str
    message: str


class FestivalGreetingIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    date: str
    message: str = Field(min_length=1, max_length=60)

    @field_validator("name", "message")
    @classmethod
    def _tidy(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("date")
    @classmethod
    def _date(cls, v: str) -> str:
        try:
            return date.fromisoformat(v).isoformat()
        except ValueError:
            raise ValueError("Use a date like 2026-11-08")


class TodayOut(BaseModel):
    people: list[Celebration]
    festivals: list[FestivalGreeting]


@router.get("/today", response_model=TodayOut)
async def today(user: User = Depends(get_current_user)) -> TodayOut:
    """Who to celebrate today, and the festival greetings for today. Clients see nothing."""
    if user.role == "client":
        return TodayOut(people=[], festivals=[])
    day = today_local()
    ws = await get_workspace()
    return TodayOut(
        people=await celebrations.todays(day),
        festivals=[f for f in ws.festival_greetings if f["date"] == day.isoformat()],
    )


@router.get("/festivals", response_model=list[FestivalGreeting], dependencies=[Depends(require_role("admin"))])
async def list_festivals() -> list[dict]:
    return sorted((await get_workspace()).festival_greetings, key=lambda f: f["date"])


@router.post("/festivals", response_model=FestivalGreeting, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def add_festival(body: FestivalGreetingIn) -> dict:
    ws = await get_workspace()
    if len(ws.festival_greetings) >= MAX_FESTIVALS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"At most {MAX_FESTIVALS} festival greetings")
    item = {"id": uuid.uuid4().hex, **body.model_dump()}
    ws.festival_greetings = [*ws.festival_greetings, item]
    await ws.save()
    return item


@router.patch("/festivals/{festival_id}", response_model=FestivalGreeting, dependencies=[Depends(require_role("admin"))])
async def edit_festival(festival_id: str, body: FestivalGreetingIn) -> dict:
    ws = await get_workspace()
    found = next((f for f in ws.festival_greetings if f["id"] == festival_id), None)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Festival greeting not found")
    item = {"id": festival_id, **body.model_dump()}
    ws.festival_greetings = [item if f["id"] == festival_id else f for f in ws.festival_greetings]
    await ws.save()
    return item


@router.delete("/festivals/{festival_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_festival(festival_id: str) -> None:
    ws = await get_workspace()
    if not any(f["id"] == festival_id for f in ws.festival_greetings):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Festival greeting not found")
    ws.festival_greetings = [f for f in ws.festival_greetings if f["id"] != festival_id]
    await ws.save()
