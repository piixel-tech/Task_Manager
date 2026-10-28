"""Admin: CSV downloads of tasks, daily status and deliverables."""
import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from app.core.deps import require_role
from app.core.timeutil import as_utc, today_local, tz
from app.models import DailyStatus, DeliverablePlan, Project, Subfolder, Task, User

router = APIRouter(prefix="/export", tags=["export"], dependencies=[Depends(require_role("admin"))])

_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: object) -> str:
    """A spreadsheet runs anything starting with = + - @ as a formula: a name or title could be used to attack whoever opens the file."""
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(_FORMULA_STARTS) else text


def _csv(name: str, header: list[str], rows: list[list[object]]) -> Response:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    for r in rows:
        writer.writerow([_cell(c) for c in r])
    body = "﻿" + out.getvalue()  # a byte-order mark so Excel reads it as UTF-8
    return Response(
        body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}-{today_local().isoformat()}.csv"'},
    )


def _day(value: str | None, label: str) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{label} must be YYYY-MM-DD")


@router.get("/tasks.csv")
async def export_tasks(
    project_id: str | None = None,
    task_status: str | None = Query(None, alias="status"),
    created_from: str | None = Query(None, description="YYYY-MM-DD"),
    created_to: str | None = Query(None, description="YYYY-MM-DD, inclusive"),
) -> Response:
    query: dict = {}
    if project_id:
        if not PydanticObjectId.is_valid(project_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "project_id is not valid")
        query["project_id"] = PydanticObjectId(project_id)
    if task_status:
        query["status"] = task_status
    start, end = _day(created_from, "created_from"), _day(created_to, "created_to")
    if start or end:
        span: dict = {}
        if start:
            span["$gte"] = datetime.combine(date.fromisoformat(start), time.min, tzinfo=tz()).astimezone(timezone.utc)
        if end:
            span["$lt"] = datetime.combine(date.fromisoformat(end) + timedelta(days=1), time.min, tzinfo=tz()).astimezone(timezone.utc)
        query["created_at"] = span
    tasks = await Task.find(query).sort("+created_at").to_list()
    people = {u.id: u for u in await User.find_all().to_list()}
    projects = {p.id: p for p in await Project.find_all().to_list()}
    subs = {s.id: s for s in await Subfolder.find_all().to_list()}
    rows = [
        [
            str(t.id),
            t.title,
            projects[t.project_id].name if t.project_id in projects else "",
            subs[t.subfolder_id].name if t.subfolder_id in subs else "",
            people[t.assignee_id].name if t.assignee_id in people else "",
            t.status,
            t.priority,
            t.due_date or "",
            t.progress,
            round(t.total_seconds / 3600, 2),
            as_utc(t.created_at).date().isoformat(),
        ]
        for t in tasks
    ]
    return _csv("tasks", ["id", "title", "project", "subfolder", "assignee", "status", "priority", "due_date", "progress_percent", "hours_tracked", "created"], rows)


@router.get("/status.csv")
async def export_status(
    date_from: str | None = Query(None, description="YYYY-MM-DD"), date_to: str | None = Query(None, description="YYYY-MM-DD, inclusive")
) -> Response:
    """Everyone's daily status (present / work from home / half day / leave) across a date range."""
    start, end = _day(date_from, "date_from"), _day(date_to, "date_to")
    query: dict = {}
    if start or end:
        query["date"] = {**({"$gte": start} if start else {}), **({"$lte": end} if end else {})}
    rows_in = await DailyStatus.find(query).sort("+date").to_list()
    people = {u.id: u for u in await User.find_all().to_list()}
    rows = [
        [r.date, people[r.user_id].name if r.user_id in people else "", people[r.user_id].email if r.user_id in people else "", r.status]
        for r in rows_in
    ]
    return _csv("daily-status", ["date", "person", "email", "status"], rows)


@router.get("/deliverables.csv")
async def export_deliverables(month: str | None = Query(None, description="YYYY-MM")) -> Response:
    query: dict = {}
    if month:
        if len(month) != 7 or month[4] != "-" or not month.replace("-", "").isdigit():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "month must be YYYY-MM")
        query["month"] = month
    plans = await DeliverablePlan.find(query).sort("+month").to_list()
    subs = {s.id: s for s in await Subfolder.find_all().to_list()}
    projects = {p.id: p for p in await Project.find_all().to_list()}
    rows = []
    for plan in plans:
        sub = subs.get(plan.subfolder_id)
        project = projects.get(sub.project_id) if sub else None
        for item in plan.items:
            rows.append([plan.month, project.name if project else "", sub.name if sub else "", item.type, item.number, item.title, item.stage])
    return _csv("deliverables", ["month", "project", "subfolder", "type", "number", "title", "stage"], rows)
