import asyncio
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.timeutil import as_utc, to_local_date, today_local, tz
from app.integrations.runner import schedule_push
from app.models import ExternalEvent, IntegrationConnection, User
from app.models.booking import Attendee, Booking
from app.models.daily_status import DailyStatus
from app.schemas.calendar import Availability, BookingCreate, BookingOut, Slot
from app.services.projects import client_team_ids
from app.services.notify import notify

router = APIRouter(prefix="/bookings", tags=["bookings"])

MIN_MINUTES = 15
MAX_HOURS = 8

# One lock per host so two simultaneous requests can't both pass the overlap check.
# (Single-process guard; use a DB-level reservation if the API ever runs on several workers.)
_host_locks: dict[PydanticObjectId, asyncio.Lock] = defaultdict(asyncio.Lock)


def _view(booking: Booking, viewer: User) -> BookingOut:
    """Everyone sees that a slot is busy; only the people involved (and admins) see the details."""
    out = BookingOut.model_validate(booking, from_attributes=True)
    involved = viewer.role == "admin" or viewer.id in (booking.host_user_id, booking.booked_by)
    if not involved:
        out.title, out.note, out.meet_url, out.attendees = "Busy", "", "", []
    return out


def _calendar_link(host: User) -> str:
    return f"{'/admin' if host.role == 'admin' else '/app'}/calendar/{host.id}"


def _fmt(moment: datetime) -> str:
    return as_utc(moment).astimezone(tz()).strftime("%a %d %b, %H:%M")


@router.get("", response_model=list[BookingOut])
async def list_bookings(
    host_user_id: PydanticObjectId,
    start: date = Query(..., alias="from"),
    end: date = Query(..., alias="to"),
    user: User = Depends(get_current_user),
) -> list[BookingOut]:
    """A host's bookings between two local dates (inclusive)."""
    require(user, "calendar.view", target_id=host_user_id, team_ids=await client_team_ids(user))
    if end < start or (end - start).days > 92:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Range must be 0-92 days")
    lo = datetime.combine(start, time.min, tzinfo=tz()).astimezone(timezone.utc)
    hi = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz()).astimezone(timezone.utc)
    rows = await Booking.find(
        Booking.host_user_id == host_user_id, Booking.start < hi, Booking.end > lo
    ).sort("+start").to_list()
    return [_view(b, user) for b in rows]


@router.get("/mine", response_model=list[BookingOut])
async def my_upcoming_bookings(user: User = Depends(get_current_user)) -> list[BookingOut]:
    """Meetings I host or booked that have not ended yet. Read-only, and only ever my own."""
    from app.services.dashboard import my_bookings

    return [_view(b, user) for b in await my_bookings(user)]


SLOT_STEP = timedelta(minutes=30)


async def _external_busy(host_id: PydanticObjectId, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """Timed, "busy" events pulled from the host's connected calendars. All-day events don't block slots."""
    rows = await ExternalEvent.find(
        ExternalEvent.user_id == host_id, ExternalEvent.busy == True, ExternalEvent.all_day == False,  # noqa: E712
        ExternalEvent.start < end, ExternalEvent.end > start,
    ).to_list()
    return [(as_utc(r.start), as_utc(r.end)) for r in rows]


@router.get("/availability", response_model=Availability)
async def availability(
    host_user_id: PydanticObjectId,
    day: date = Query(..., alias="date"),
    minutes: int = Query(30, ge=MIN_MINUTES, le=240, multiple_of=15, description="How long the meeting is"),
    user: User = Depends(get_current_user),
) -> Availability:
    """The host's free start times on one local day, any time of day: not past, not on leave, not overlapping a booking."""
    require(user, "calendar.view", target_id=host_user_id, team_ids=await client_team_ids(user))
    host = await User.get(host_user_id)
    if host is None or not host.is_active or host.role == "client":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Host not found")

    def result(slots: list[Slot], note: str | None = None) -> Availability:
        return Availability(host_user_id=host.id, date=day.isoformat(), minutes=minutes, slots=slots, note=note)

    if day < today_local():
        return result([], "That day is in the past")
    if await DailyStatus.find_one(DailyStatus.user_id == host.id, DailyStatus.date == day.isoformat(), DailyStatus.status == "leave"):
        return result([], f"{host.name} is on leave that day")

    opens = datetime.combine(day, time.min, tzinfo=tz()).astimezone(timezone.utc)
    closes = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz()).astimezone(timezone.utc)
    busy = await Booking.find(Booking.host_user_id == host.id, Booking.start < closes, Booking.end > opens).to_list()
    busy = [(as_utc(b.start), as_utc(b.end)) for b in busy]
    busy += await _external_busy(host.id, opens, closes)  # timed events on their connected calendars (e.g. Google)
    now = datetime.now(timezone.utc)
    length = timedelta(minutes=minutes)

    slots, t = [], opens
    while t + length <= closes:
        if t >= now and not any(t < end and t + length > start for start, end in busy):
            slots.append(Slot(start=t, end=t + length))
        t += SLOT_STEP
    return result(slots, None if slots else "No free time left that day")


async def _attendees(body: BookingCreate, host: User, user: User) -> list[Attendee]:
    """Resolve the guests: teammates by id, everyone else by email. The host and the booker already have the booking."""
    if not body.attendees:
        return []
    if user.role == "client":  # an invite goes out from the team's Google calendar: clients can't send them to anyone
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clients can't add guests")
    ids = [a.user_id for a in body.attendees if a.user_id]
    team = {u.id: u for u in await User.find({"_id": {"$in": ids}}).to_list()}
    emails = [a.email for a in body.attendees if a.email]
    known = {u.email.lower(): u for u in await User.find({"email": {"$in": emails}}).to_list()} if emails else {}
    out: dict[str, Attendee] = {}
    for a in body.attendees:
        if a.user_id:
            person = team.get(a.user_id)
            if person is None or not person.is_active or person.role == "client":
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Guests must be active team members or an email address")
        else:
            person = known.get(a.email)
            if person is not None and (not person.is_active or person.role == "client"):
                person = None  # a client's address is still just an address
        email = (person.email if person else a.email).lower()
        out[email] = Attendee(email=email, name=person.name if person else "", user_id=person.id if person else None)
    for p in (host, user):
        out.pop(p.email.lower(), None)
    guests = list(out.values())
    if guests and not await IntegrationConnection.find_one(
        {"user_id": {"$in": [host.id, user.id]}, "provider": "google", "status": "connected"}
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Guests are invited through Google Calendar. Connect Google in Settings > Connected apps first (you or the host).",
        )
    return guests


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(body: BookingCreate, user: User = Depends(get_current_user)) -> BookingOut:
    require(user, "booking.create", target_id=body.host_user_id, team_ids=await client_team_ids(user))

    host = await User.get(body.host_user_id)
    if host is None or not host.is_active or host.role == "client":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Host not found")
    if host.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't book a slot on your own calendar")

    guests = await _attendees(body, host, user)
    start, end = body.start, body.end
    minutes = (end - start).total_seconds() / 60
    if minutes < MIN_MINUTES or minutes > MAX_HOURS * 60:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"A booking must be between {MIN_MINUTES} minutes and {MAX_HOURS} hours",
        )
    if start < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Can't book a slot in the past")
    day = to_local_date(start)
    if to_local_date(end - timedelta(seconds=1)) != day:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A booking must stay within one day")

    on_leave = await DailyStatus.find_one(
        DailyStatus.user_id == host.id, DailyStatus.date == day.isoformat(), DailyStatus.status == "leave"
    )
    if on_leave:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{host.name} is on leave that day")

    if await _external_busy(host.id, start, end):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{host.name} is busy at that time")

    async with _host_locks[host.id]:
        clash = await Booking.find_one(
            Booking.host_user_id == host.id, Booking.start < end, Booking.end > start
        )
        if clash:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"That slot overlaps an existing booking ({_fmt(clash.start)} - {_fmt(clash.end)})",
            )
        booking = Booking(
            host_user_id=host.id,
            booked_by=user.id,
            start=start,
            end=end,
            title=body.title.strip(),
            note=body.note.strip(),
            attendees=guests,
        )
        await booking.insert()

    schedule_push([host.id, user.id])
    teammates = [g.user_id for g in guests if g.user_id]
    if teammates:
        await notify(
            teammates,
            type="booking_invited",
            title=f"Invited: {booking.title}",
            body=f"{user.name} invited you to {_fmt(start)} - {_fmt(end)} with {host.name}.",
            link=_calendar_link(host),
            actor_id=user.id,
        )
    await notify(
        [host.id],
        type="booking_created",
        title=f"New booking: {booking.title}",
        body=f"{user.name} booked {_fmt(start)} - {_fmt(end)}.",
        link=_calendar_link(host),
        actor_id=user.id,
    )
    return _view(booking, user)


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_booking(booking_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    booking = await Booking.get(booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if user.role != "admin" and user.id not in (booking.host_user_id, booking.booked_by):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the host, the booker or an admin can cancel")

    host = await User.get(booking.host_user_id)
    await booking.delete()
    schedule_push([booking.host_user_id, booking.booked_by])

    # Tell whoever didn't cancel it.
    others = {booking.host_user_id, booking.booked_by} - {user.id}
    if others and host is not None:
        await notify(
            list(others),
            type="booking_cancelled",
            title=f"Booking cancelled: {booking.title}",
            body=f"{user.name} cancelled {_fmt(booking.start)} - {_fmt(booking.end)}.",
            link=_calendar_link(host),
            actor_id=user.id,
        )
