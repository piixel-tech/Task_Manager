"""Birthdays, work milestones and festival greetings: who and what to celebrate today."""
import calendar
import re
from datetime import date, datetime

from fastapi import HTTPException, status

from app.core.timeutil import today_local, tz
from app.models import Company, User
from app.services.notify import notify
from app.services.workspace import get_workspace

_MMDD = re.compile(r"^(\d{2})-(\d{2})$")
MILESTONE_MONTHS = (1, 3, 6)  # then every 12 months


def clean_birthday(value: str | None) -> str:
    """"MM-DD" (a real calendar day; 29 Feb is allowed) or "" to clear it."""
    v = (value or "").strip()
    if not v:
        return ""
    m = _MMDD.match(v)
    if not m or not (1 <= int(m[1]) <= 12) or not (1 <= int(m[2]) <= calendar.monthrange(2024, int(m[1]))[1]):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a real day and month for the birthday")
    return v


def clean_joined(value: str | None, today: date) -> str:
    """A YYYY-MM-DD joining date that is not in the future, or "" to clear it."""
    v = (value or "").strip()
    if not v:
        return ""
    try:
        d = date.fromisoformat(v)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Use a date like 2024-03-18")
    if d > today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The joining date can't be in the future")
    return v


def clean_birth_year(value: int | None, today: date) -> int | None:
    if value is None:
        return None
    if not (1900 <= value <= today.year):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That birth year doesn't look right")
    return value


def apply_dates(user: User, data: dict) -> None:
    """Check birthday / birth year / joining date in `data`, set them on the user and take them out of `data`."""
    today = today_local()
    if "birthday" in data:
        user.birthday = clean_birthday(data.pop("birthday"))
        if not user.birthday:
            user.birth_year = None
    if "birth_year" in data:
        year = clean_birth_year(data.pop("birth_year"), today)
        user.birth_year = year if user.birthday else None
    if "joined_on" in data:
        user.joined_on = clean_joined(data.pop("joined_on"), today)


def joined_on(user: User) -> str:
    """The day they joined: the date set on their profile, otherwise the day the account was made."""
    return user.joined_on or user.created_at.date().isoformat()


def is_birthday(birthday: str, today: date) -> bool:
    m = _MMDD.match(birthday or "")
    if not m:
        return False
    month, day = int(m[1]), int(m[2])
    if (month, day) == (2, 29) and not calendar.isleap(today.year):
        day = 28  # a 29 February birthday is marked on the 28th in other years
    return (today.month, today.day) == (month, day)


def milestone_months(joined: str, today: date) -> int | None:
    """How many months of work today marks (1, 3, 6, 12, 24...), or None. The join day itself is not one."""
    try:
        j = date.fromisoformat(joined)
    except ValueError:
        return None
    months = (today.year * 12 + today.month) - (j.year * 12 + j.month)
    if months <= 0 or today.day != min(j.day, calendar.monthrange(today.year, today.month)[1]):
        return None
    return months if months in MILESTONE_MONTHS or months % 12 == 0 else None


def milestone_duration(months: int) -> str:
    """"1 month", "6 months", "1 year", "2 years"."""
    if months < 12:
        return f"{months} month{'s' if months != 1 else ''}"
    years = months // 12
    return f"{years} year{'s' if years != 1 else ''}"


def milestone_label(months: int, company: str | None) -> str:
    return f"{milestone_duration(months)}{f' with {company}' if company else ' on the team'}"


async def todays(today: date) -> list[dict]:
    """Everyone on the team (not clients) with a birthday or a work milestone today."""
    people = await User.find({"is_active": True, "role": {"$in": ["admin", "employee"]}}).to_list()
    companies = {c.id: c.name for c in await Company.find_all().to_list()}
    out: list[dict] = []
    for u in people:
        company = companies.get(u.company_id)
        base = {"user_id": str(u.id), "name": u.name, "avatar_url": u.avatar_url, "company": company}
        if is_birthday(u.birthday, today):
            out.append({**base, "kind": "birthday", "label": "Birthday"})
        months = milestone_months(joined_on(u), today)
        if months:
            out.append({**base, "kind": "milestone", "months": months, "duration": milestone_duration(months), "label": milestone_label(months, company)})
    return out


# --- the morning notifications ---------------------------------------------------------------------------------------------------
SEND_FROM_HOUR = 8  # local time: nothing goes out before the working day starts


def _first(name: str) -> str:
    return name.split()[0] if name.split() else name


def _key(c: dict) -> str:
    return f"{c['kind']}:{c['user_id']}:{c.get('months') or 0}"


def _where(c: dict) -> str:
    return f"at {c['company']}" if c.get("company") else "on the team"


def _about(c: dict) -> str:
    """What everyone else is told: "Today is Kanisha's birthday" / "Kanisha completes 1 year at Piixel today"."""
    if c["kind"] == "birthday":
        return f"Today is {_first(c['name'])}'s birthday"
    return f"{_first(c['name'])} completes {c['duration']} {_where(c)} today"


def _wish(c: dict) -> tuple[str, str]:
    """What the person themselves is told."""
    first = _first(c["name"])
    if c["kind"] == "birthday":
        return f"Happy birthday, {first}! 🎂", "The whole team is wishing you a wonderful day."
    return f"Happy {c['duration']} {_where(c)}, {first}! 🎉", "Thank you for being part of the team."


def _home(user: User) -> str:
    return "/admin/dashboard" if user.role == "admin" else "/app/dashboard"


async def run_celebration_notifications(now: datetime | None = None) -> int:
    """From 8 AM: tell the team about today's birthdays and work anniversaries, and everyone about today's festival greeting.

    Each one goes out once a day (it is remembered on the workspace, so a restart or a repeat run sends nothing twice, and one
    added later in the day still gets its notification). Nobody is told about their own birthday: they get a wish instead.
    """
    now = now or datetime.now(tz())
    if now.hour < SEND_FROM_HOUR:
        return 0
    today = now.date().isoformat()
    ws = await get_workspace()
    done = set(ws.celebrations_sent.get("keys", [])) if ws.celebrations_sent.get("date") == today else set()

    fresh = [c for c in await todays(now.date()) if _key(c) not in done]
    festivals = [f for f in ws.festival_greetings if f["date"] == today and f"festival:{f['id']}" not in done]
    if not fresh and not festivals:
        return 0

    # Remember first: a crash half-way must not make the next run repeat the ones already sent.
    ws.celebrations_sent = {"date": today, "keys": sorted(done | {_key(c) for c in fresh} | {f"festival:{f['id']}" for f in festivals})}
    await ws.save()

    team = await User.find({"is_active": True, "role": {"$in": ["admin", "employee"]}}).to_list()
    sent = 0
    for person in team:
        for c in (c for c in fresh if c["user_id"] == str(person.id)):
            title, body = _wish(c)
            await notify([person.id], type="birthday" if c["kind"] == "birthday" else "work_anniversary", title=title, body=body, link=_home(person))
            sent += 1
        others = [c for c in fresh if c["user_id"] != str(person.id)]
        if others:
            lines = [_about(c) for c in others]
            kind = "birthday" if all(c["kind"] == "birthday" for c in others) else "work_anniversary"
            await notify(
                [person.id],
                type=kind,
                title=lines[0] if len(lines) == 1 else f"{len(lines)} celebrations today",
                body="Send your wishes." if len(lines) == 1 else "; ".join(lines),
                link=_home(person),
            )
            sent += 1
    for f in festivals:
        await notify([p.id for p in team], type="festival", title=f["name"], body=f["message"], link=None)
        sent += len(team)
    return sent
