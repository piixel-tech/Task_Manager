"""Events pulled in from connected apps, shown on a calendar. Owners see everything; everyone else only sees "Busy"."""
from datetime import date, datetime, time, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.timeutil import as_utc, tz
from app.models import ExternalEvent, User
from app.services.projects import client_team_ids

router = APIRouter(prefix="/external-events", tags=["integrations"])


class ExternalEventOut(BaseModel):
    id: PydanticObjectId
    provider: str
    title: str
    start: datetime
    end: datetime
    all_day: bool
    location: str = ""
    html_link: str = ""
    busy: bool = True  # false: marked "free" in Google, so it doesn't block booking (only the owner ever sees these)
    private: bool  # true: you are looking at someone else's calendar, so only the fact that they are busy is shown


@router.get("", response_model=list[ExternalEventOut])
async def list_external_events(
    host_user_id: PydanticObjectId,
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    user: User = Depends(get_current_user),
) -> list[ExternalEventOut]:
    require(user, "calendar.view", target_id=host_user_id, team_ids=await client_team_ids(user))
    if end < start or (end - start).days > 92:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Range must be 0-92 days")
    lo = datetime.combine(start, time.min, tzinfo=tz()).astimezone(timezone.utc)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz()).astimezone(timezone.utc)
    query: dict = {"user_id": host_user_id, "start": {"$lt": hi}, "end": {"$gt": lo}}
    mine = host_user_id == user.id  # not even admins read other people's Google details
    if not mine:
        query["busy"] = True  # "free" events say nothing about availability
    rows = await ExternalEvent.find(query).sort("+start").to_list()
    return [
        ExternalEventOut(
            id=r.id,
            provider=r.provider,
            title=r.title if mine else "Busy",
            start=as_utc(r.start),
            end=as_utc(r.end),
            all_day=r.all_day,
            location=r.location if mine else "",
            html_link=r.html_link if mine else "",
            busy=r.busy,
            private=not mine,
        )
        for r in rows
    ]
