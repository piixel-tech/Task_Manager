"""Monthly report of one employee: attendance, tasks, time tracked and changes requested.

The current month is built from live data on every request ("in progress"). A finished month is built once, saved in
`monthly_reports` and returned unchanged from then on, so later edits never rewrite history.
"""
import calendar
import re
from datetime import date, datetime, timedelta, timezone

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.timeutil import as_utc, to_local_date, today_local, tz
from app.models import Company, DailyStatus, File, MonthlyReport, Project, Subfolder, Task, TaskActivity, TaskReview, TimeLog, User, Workspace
from app.schemas.report import (
    Attendance,
    AttendanceDay,
    DaySeconds,
    Previous,
    ProjectSeconds,
    TimeSpent,
    ReportFile,
    ReportListRow,
    ReportOut,
    ReportPerson,
    TaskRow,
    TaskTotals,
    TimeTotals,
    TopTask,
)
from app.services import richtext

MONTH = re.compile(r"^(20\d\d)-(0[1-9]|1[0-2])$")
WORKING = ("present", "wfh", "half_day")
DESCRIPTION_CHARS = 80


def month_of(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def valid_month(value: str) -> bool:
    """A real month that has started (a future month has no report)."""
    return bool(MONTH.match(value)) and value <= month_of(today_local())


def _bounds(month: str) -> tuple[date, date, datetime, datetime]:
    y, m = int(month[:4]), int(month[5:])
    first = date(y, m, 1)
    last = date(y, m, calendar.monthrange(y, m)[1])
    start = datetime(y, m, 1, tzinfo=tz()).astimezone(timezone.utc)
    end = datetime.combine(last + timedelta(days=1), datetime.min.time(), tzinfo=tz()).astimezone(timezone.utc)
    return first, last, start, end


def _hhmm(minutes: float) -> str:
    return f"{int(minutes) // 60:02d}:{int(minutes) % 60:02d}"


def _short(text: str, n: int = DESCRIPTION_CHARS) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def clock12(hhmm: str | None, round_to: int = 5) -> str:
    """"13:17" -> "1:15 PM" (rounded to the nearest 5 minutes)."""
    if not hhmm:
        return "-"
    total = round((int(hhmm[:2]) * 60 + int(hhmm[3:5])) / round_to) * round_to % (24 * 60)
    h, m = divmod(total, 60)
    return f"{(h % 12) or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def clock12_exact(hhmm: str | None) -> str:
    """"13:07" -> "1:07 PM" (not rounded)."""
    if not hhmm:
        return "-"
    h = int(hhmm[:2])
    return f"{(h % 12) or 12}:{hhmm[3:5]} {'AM' if h < 12 else 'PM'}"


def nice_time(seconds: int) -> str:
    """37m, 2h 15m, 24h. Never seconds."""
    mins = max(0, int(seconds)) // 60
    h, m = divmod(mins, 60)
    return f"{h}h {m}m" if h and m else f"{h}h" if h else f"{m}m"


def versus(report: ReportOut) -> dict[str, str | None]:
    """The small grey "vs last month" lines (None = hide: there is no last month to compare with)."""
    out: dict[str, str | None] = {"days": None, "login": None, "completed": None, "time": None}
    p = report.previous
    if not p:
        return out
    a = report.attendance

    def signed(n: int, text: str) -> str:
        return "Same as last month" if n == 0 else f"{'+' if n > 0 else '-'}{text} vs last month"

    d_days = a.present + a.wfh + a.half_day - p.days_worked
    out["days"] = signed(d_days, f"{abs(d_days)} day{'s' if abs(d_days) != 1 else ''}")
    if a.avg_login and p.avg_login:
        mins = lambda t: int(t[:2]) * 60 + int(t[3:5])  # noqa: E731
        d = mins(a.avg_login) - mins(p.avg_login)
        out["login"] = "About the same as last month" if abs(d) < 5 else f"{nice_time(abs(d) * 60)} {'earlier' if d < 0 else 'later'} than last month"
    if report.tasks.assigned:
        d_done = report.tasks.completed - p.completed
        out["completed"] = signed(d_done, str(abs(d_done)))
    d_time = report.time.total_seconds - p.total_seconds
    out["time"] = "Same as last month" if abs(d_time) < 60 else signed(d_time, nice_time(abs(d_time)))
    return out


def summarize(report: ReportOut) -> str:
    """One plain-English paragraph about the month."""
    first = (report.person.name.split() or ["They"])[0]
    name = calendar.month_name[int(report.month[5:])]
    a, t = report.attendance, report.tasks
    worked = a.present + a.wfh + a.half_day
    if not (a.days or report.time.total_seconds or t.assigned):
        return f"No activity was recorded for {first} in {name}{' so far' if report.state == 'in_progress' else ''}."
    parts = []
    if a.days:
        parts.append(f"was present {worked} of {max(worked, a.scheduled_days)} working days" if a.scheduled_days else f"was present {worked} day{'s' if worked != 1 else ''}")
    if a.avg_login:
        parts.append(f"usually logged in around {clock12(a.avg_login)}")
    n = len(report.time_spent) or len(report.top_tasks)
    parts.append(f"tracked {nice_time(report.time.total_seconds)} across {n} task{'s' if n != 1 else ''}" if report.time.total_seconds else "tracked no time")
    body = ", ".join(parts[:-1]) + (", and " if len(parts) > 2 else " and ") + parts[-1] if len(parts) > 1 else parts[0]
    text = f"In {name}{' (so far)' if report.state == 'in_progress' else ''}, {first} {body}."
    if t.assigned:
        still = t.pending + t.overdue
        text += f" {t.completed} of {t.assigned} tasks completed" + (f", {still} still pending" if still else "") + "."
    else:
        text += " No tasks this month."
    return text


async def _schedule(user: User, first: date, last: date, today: date) -> tuple[int, list[str]]:
    """Working days up to today, and the month's off days (weekly offs and holidays that apply to this person's company)."""
    ws = await Workspace.find_one()
    weekly = set(ws.weekly_off) if ws else {6}
    holidays: set[date] = set()
    for h in (ws.holidays if ws else []):
        if h.type == "optional" or (h.company_ids and user.company_id not in h.company_ids):
            continue
        d, end = date.fromisoformat(h.date), date.fromisoformat(h.end_date or h.date)
        while d <= end:
            holidays.add(d)
            d += timedelta(days=1)
    off: list[str] = []
    scheduled, cur = 0, first
    while cur <= last:
        if cur.weekday() in weekly or cur in holidays:
            off.append(cur.isoformat())
        elif cur <= today:
            scheduled += 1
        cur += timedelta(days=1)
    return scheduled, off


async def _previous(user: User, month: str) -> Previous | None:
    y, m = int(month[:4]), int(month[5:])
    prev = month_of(date(y - 1, 12, 1) if m == 1 else date(y, m - 1, 1))
    _, prev_last, _, prev_end = _bounds(prev)
    if as_utc(user.created_at) >= prev_end:
        return None
    saved = await MonthlyReport.find_one(MonthlyReport.user_id == user.id, MonthlyReport.month == prev)
    rep = ReportOut.model_validate(saved.data) if saved else await build_report(user, prev, compare=False)
    if not (rep.attendance.days or rep.time.total_seconds or rep.tasks.assigned):
        return None
    a = rep.attendance
    return Previous(days_worked=a.present + a.wfh + a.half_day, avg_login=a.avg_login, completed=rep.tasks.completed, total_seconds=rep.time.total_seconds)


async def build_report(user: User, month: str, now: datetime | None = None, compare: bool = True) -> ReportOut:
    """The report built from the data as it is right now."""
    now = now or datetime.now(timezone.utc)
    first, last, start_utc, end_utc = _bounds(month)
    in_month = lambda d: bool(d) and first.isoformat() <= d <= last.isoformat()  # noqa: E731 (YYYY-MM-DD strings sort as dates)

    company = await Company.get(user.company_id) if user.company_id else None
    person = ReportPerson(id=user.id, name=user.name, company=company.name if company else "", role=user.role)

    # --- Attendance: the day's status, and "login" = when it was first set that day ---
    records = await DailyStatus.find({"user_id": user.id, "date": {"$gte": first.isoformat(), "$lte": last.isoformat()}}).sort("+date").to_list()
    days: list[AttendanceDay] = []
    minutes: list[float] = []
    for r in records:
        moment = as_utc(r.first_set_at or r.set_at).astimezone(tz())  # older records only know their latest change
        minutes.append(moment.hour * 60 + moment.minute)
        days.append(AttendanceDay(date=r.date, status=r.status, login_time=moment.strftime("%H:%M")))
    count = lambda s: sum(1 for d in days if d.status == s)  # noqa: E731
    attendance = Attendance(
        present=count("present"), wfh=count("wfh"), leave=count("leave"), half_day=count("half_day"),
        avg_login=_hhmm(sum(minutes) / len(minutes)) if minutes else None, days=days,
        earliest_login=_hhmm(min(minutes)) if minutes else None, latest_login=_hhmm(max(minutes)) if minutes else None,
    )
    attendance.scheduled_days, attendance.off_dates = await _schedule(user, first, last, today_local())

    # --- Time tracked this month (by this person) ---
    logs = await TimeLog.find({"user_id": user.id, "started_at": {"$gte": start_utc, "$lt": end_utc}}).to_list()
    per_task: dict[PydanticObjectId, int] = {}
    logged_days: set[str] = set()
    per_day: dict[str, int] = {}
    for log in logs:
        secs = max(0, int((now - as_utc(log.started_at)).total_seconds())) if log.running else log.seconds
        per_task[log.task_id] = per_task.get(log.task_id, 0) + secs
        logged_days.add(to_local_date(log.started_at).isoformat())
        per_day[to_local_date(log.started_at).isoformat()] = per_day.get(to_local_date(log.started_at).isoformat(), 0) + secs
    total_seconds = sum(per_task.values())
    working_days = sum(1 for d in days if d.status in WORKING) or len(logged_days)
    time = TimeTotals(total_seconds=total_seconds, avg_seconds_per_day=total_seconds // working_days if working_days else 0, working_days=working_days)

    # --- Tasks: assigned to them and due this month, or finished this month ---
    mine = await Task.find(Task.assignee_id == user.id).to_list()
    known = {t.id for t in mine}
    elsewhere = [tid for tid, s in per_task.items() if s > 0 and tid not in known]  # time tracked on a task that is not theirs
    if elsewhere:
        mine += await Task.find({"_id": {"$in": elsewhere}}).to_list()
    reviews = await TaskReview.find({"task_id": {"$in": [t.id for t in mine]}}).sort("+round").to_list() if mine else []
    by_task: dict[PydanticObjectId, list[TaskReview]] = {}
    for r in reviews:
        by_task.setdefault(r.task_id, []).append(r)

    def completed_on(t: Task) -> str | None:
        if t.status != "approved":
            return None
        approvals = [r.decided_at for r in by_task.get(t.id, []) if r.decision == "approved" and r.decided_at]
        return to_local_date(max(approvals, key=as_utc)).isoformat() if approvals else None

    chosen = [
        t for t in mine
        if in_month(t.due_date) or in_month(completed_on(t)) or per_task.get(t.id, 0) > 0 or (not t.due_date and in_month(to_local_date(t.created_at).isoformat()))
    ]
    chosen.sort(key=lambda t: (t.due_date or "9999", t.created_at))

    ids = [t.id for t in chosen]
    projects = {p.id: p for p in await Project.find({"_id": {"$in": list({t.project_id for t in chosen})}}).to_list()} if chosen else {}
    subs = {s.id: s for s in await Subfolder.find({"_id": {"$in": list({t.subfolder_id for t in chosen})}}).to_list()} if chosen else {}
    changes = await TaskActivity.find({"task_id": {"$in": ids}, "kind": "change_request"}).to_list() if ids else []
    file_ids = list(dict.fromkeys(f for t in chosen for r in by_task.get(t.id, []) for f in r.file_ids))
    files = {f.id: f for f in await File.find({"_id": {"$in": file_ids}}).to_list()} if file_ids else {}

    rows: list[TaskRow] = []
    totals = TaskTotals(assigned=len(chosen))
    today = to_local_date(now)
    for t in chosen:
        done = completed_on(t)
        late_days = early_days = overdue_days = 0
        if t.status != "approved":
            if t.due_date and t.due_date < today.isoformat():
                result = "Overdue"  # not done and the due date has passed
                overdue_days = (today - date.fromisoformat(t.due_date)).days
                totals.overdue += 1
            else:
                result = "Pending"
                totals.pending += 1
        else:
            totals.completed += 1
            if not t.due_date or not done or done == t.due_date:
                result = "On time"  # no deadline (or an approval without a recorded date) cannot be late
                totals.on_time += 1
            elif done < t.due_date:
                result = "Early"
                early_days = (date.fromisoformat(t.due_date) - date.fromisoformat(done)).days
                totals.early += 1
            else:
                result = "Late"
                late_days = (date.fromisoformat(done) - date.fromisoformat(t.due_date)).days
                totals.late += 1
        mine_changes = [c for c in changes if c.task_id == t.id]
        resolved = [as_utc(c.resolved_at) for c in mine_changes if c.resolved and c.resolved_at]
        text = richtext.read(t.description)[0] if t.description_html else t.description
        project, sub = projects.get(t.project_id), subs.get(t.subfolder_id)
        attached = [files[f] for f in dict.fromkeys(f for r in by_task.get(t.id, []) for f in r.file_ids) if f in files]
        rows.append(
            TaskRow(
                task_id=t.id, title=t.title, description=_short(text), project=project.name if project else "", subfolder=sub.name if sub else "",
                start=t.start_date or to_local_date(t.created_at).isoformat(), due=t.due_date, completed=done, result=result, late_days=late_days, early_days=early_days, overdue_days=overdue_days,
                seconds=per_task.get(t.id, 0), changes=len(mine_changes),
                last_change_resolved=to_local_date(max(resolved)).isoformat() if resolved else None,
                files=[ReportFile(name=f.name, kind=f.kind, url=f.url if f.kind == "link" else None) for f in attached],
            )
        )

    title_of = {t.id: t.title for t in mine}
    task_of = {t.id: t for t in mine}
    per_project: dict[str, int] = {}
    for tid, s in per_task.items():
        t = task_of.get(tid)
        if t and s > 0:
            project, sub = projects.get(t.project_id), subs.get(t.subfolder_id)
            name = f"{project.name if project else 'No project'} / {sub.name if sub else 'No subfolder'}"
            per_project[name] = per_project.get(name, 0) + s
    spent = sorted(((tid, s) for tid, s in per_task.items() if s > 0 and tid in title_of), key=lambda x: -x[1])
    top = spent[:3]
    return ReportOut(
        person=person, month=month, state="in_progress" if month == month_of(today_local()) else "final", generated_at=now,
        attendance=attendance, tasks=totals, time=time, changes_requested=sum(r.changes for r in rows),
        top_tasks=[TopTask(task_id=tid, title=title_of[tid], seconds=s) for tid, s in top], rows=rows,
        time_by_day=[DaySeconds(date=d, seconds=s) for d, s in sorted(per_day.items())],
        time_by_project=[ProjectSeconds(name=n, seconds=s) for n, s in sorted(per_project.items(), key=lambda x: -x[1])],
        time_spent=[TimeSpent(task_id=tid, title=title_of[tid], seconds=s) for tid, s in spent],
        previous=await _previous(user, month) if compare else None,
    )


async def get_report(user: User, month: str) -> ReportOut:
    report = await _get_report(user, month)
    report.summary = summarize(report)
    return report


async def _get_report(user: User, month: str) -> ReportOut:
    """Live for the current month; for a finished month the saved snapshot (made now, once, if it does not exist yet)."""
    if month == month_of(today_local()):
        return await build_report(user, month)
    saved = await MonthlyReport.find_one(MonthlyReport.user_id == user.id, MonthlyReport.month == month)
    if saved is None:
        report = await build_report(user, month)
        try:
            await MonthlyReport(user_id=user.id, month=month, data=report.model_dump(mode="json")).insert()
        except DuplicateKeyError:  # two requests made it at the same moment: use the one that won
            saved = await MonthlyReport.find_one(MonthlyReport.user_id == user.id, MonthlyReport.month == month)
            return ReportOut.model_validate(saved.data)
        return report
    return ReportOut.model_validate(saved.data)


async def employees_for(month: str, company_id: PydanticObjectId | None = None, q: str = "") -> list[User]:
    """Employees who existed by the end of that month, optionally of one company and matching a name."""
    _, _, _, end_utc = _bounds(month)
    query: dict = {"role": "employee"}
    if company_id:
        query["company_id"] = company_id
    people = await User.find(query).sort("+name").to_list()
    needle = q.strip().lower()
    return [u for u in people if as_utc(u.created_at) < end_utc and (not needle or needle in u.name.lower())]


def list_row(report: ReportOut) -> ReportListRow:
    done = report.tasks.completed
    return ReportListRow(
        user_id=report.person.id, name=report.person.name, company=report.person.company, state=report.state,
        present=report.attendance.present, wfh=report.attendance.wfh, leave=report.attendance.leave, half_day=report.attendance.half_day,
        completed=done, assigned=report.tasks.assigned, days_worked=report.attendance.present + report.attendance.wfh + report.attendance.half_day,
        scheduled_days=report.attendance.scheduled_days, avg_login=report.attendance.avg_login, summary=report.summary, on_time_pct=round(100 * (report.tasks.early + report.tasks.on_time) / done) if done else None, total_seconds=report.time.total_seconds,
    )


async def finalize_previous_month() -> int:
    """On the 1st: freeze last month for every employee who does not have a snapshot yet. Returns how many were made."""
    today = today_local()
    month = month_of(today.replace(day=1) - timedelta(days=1))
    made = 0
    for user in await employees_for(month):
        if await MonthlyReport.find_one(MonthlyReport.user_id == user.id, MonthlyReport.month == month) is None:
            await get_report(user, month)
            made += 1
    return made
