from datetime import date, datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.timeutil import today_local
from app.models import User
from app.models.daily_status import DailyStatus
from app.models.project import Subfolder
from app.schemas.calendar import MyToday, StatusOut, StatusSet, TodayRow
from app.services.projects import client_team_ids
from app.services.ws_manager import manager

router = APIRouter(prefix="/daily-status", tags=["daily-status"])


def _parse_date(value: str | None) -> str:
    if value is None:
        return today_local().isoformat()
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "date must be YYYY-MM-DD")


async def _staff_ids() -> list[PydanticObjectId]:
    staff = await User.find({"role": {"$in": ["admin", "employee"]}, "is_active": True}).to_list()
    return [u.id for u in staff]


@router.get("/me/today", response_model=MyToday)
async def my_today(user: User = Depends(get_current_user)) -> MyToday:
    """Drives the first-login-of-the-day popup: status is null until it is set."""
    today = today_local().isoformat()
    record = await DailyStatus.find_one(DailyStatus.user_id == user.id, DailyStatus.date == today)
    return MyToday(date=today, status=record.status if record else None, set_at=record.set_at if record else None)


@router.put("/today", response_model=StatusOut)
async def set_today(body: StatusSet, user: User = Depends(get_current_user)) -> DailyStatus:
    """Set or change today's status. Past and future days can't be edited."""
    require(user, "status.set")
    today = today_local().isoformat()
    record = await DailyStatus.find_one(DailyStatus.user_id == user.id, DailyStatus.date == today)
    if record is None:
        record = DailyStatus(user_id=user.id, date=today, status=body.status, first_set_at=datetime.now(timezone.utc))
        try:
            await record.insert()
        except DuplicateKeyError:  # two tabs answered the popup at once
            record = await DailyStatus.find_one(DailyStatus.user_id == user.id, DailyStatus.date == today)
    record.status = body.status
    record.set_at = datetime.now(timezone.utc)
    await record.save()

    # Live update for dashboards/calendars. A status isn't a "notification" for
    # anyone, so this is a plain WebSocket event rather than notify().
    await manager.send_to_users(
        await _staff_ids(),
        "daily_status",
        {"user_id": str(user.id), "date": today, "status": record.status},
    )
    return record


@router.get("", response_model=list[TodayRow])
async def overview(
    on: str | None = Query(None, alias="date"), user: User = Depends(get_current_user)
) -> list[TodayRow]:
    """Everyone's status for a day (default today): the dashboard's Today overview."""
    require(user, "calendar.view")
    day = _parse_date(on)
    staff = await User.find({"role": {"$in": ["admin", "employee"]}, "is_active": True}).sort("+name").to_list()
    records = await DailyStatus.find(DailyStatus.date == day).to_list()
    by_user = {r.user_id: r for r in records}
    head_ids = {h for s in await Subfolder.find_all().to_list() for h in s.head_ids}
    return [
        TodayRow(
            user_id=u.id,
            name=u.name,
            avatar_url=u.avatar_url,
            company_id=u.company_id,
            role=u.role,
            title=u.title,
            status=by_user[u.id].status if u.id in by_user else None,
            set_at=by_user[u.id].set_at if u.id in by_user else None,
            is_head=u.id in head_ids,
        )
        for u in staff
    ]


@router.get("/team", response_model=list[StatusOut])
async def team_range(
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    user: User = Depends(get_current_user),
) -> list[DailyStatus]:
    """Everyone's statuses between two dates (inclusive): who is in the office, working from home, on half days or on leave, per day."""
    require(user, "calendar.view")
    if end < start or (end - start).days > 92:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Range must be 0-92 days")
    return await DailyStatus.find(
        {"user_id": {"$in": await _staff_ids()}, "date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}
    ).sort("+date").to_list()


@router.get("/users/{user_id}", response_model=list[StatusOut])
async def user_range(
    user_id: PydanticObjectId,
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    user: User = Depends(get_current_user),
) -> list[DailyStatus]:
    """One person's statuses between two dates (inclusive), for their calendar."""
    require(user, "calendar.view", target_id=user_id, team_ids=await client_team_ids(user))
    if end < start or (end - start).days > 92:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Range must be 0-92 days")
    return await DailyStatus.find(
        DailyStatus.user_id == user_id,
        DailyStatus.date >= start.isoformat(),
        DailyStatus.date <= end.isoformat(),
    ).sort("+date").to_list()
