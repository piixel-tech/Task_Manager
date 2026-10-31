from collections import defaultdict
from datetime import datetime, time, timedelta, timezone

from app.core.timeutil import as_utc, today_local, tz
from app.models import ClientApproval, File, Project, Task, TaskActivity, User
from app.models.booking import Booking
from app.models.chat import ChatGroup
from app.models.task import OPEN_STATUSES, TimeLog
from app.schemas.calendar import BookingOut
from app.schemas.chat import ApprovalItem
from app.schemas.dashboard import ActivityRow, AdminDashboard, ProjectHealth, TaskCounts, WorkloadRow
from app.services.chat import approval_out, groups_of
from app.services.projects import brief, load_users, unique

TOP = 5


def _day_bounds_utc(day):
    lo = datetime.combine(day, time.min, tzinfo=tz()).astimezone(timezone.utc)
    return lo, lo + timedelta(days=1)


async def oldest_pending_approvals(user: User, limit: int = TOP) -> list[ApprovalItem]:
    """Pending approvals, longest-waiting first, but only in chat groups the user is in (same rule as chat)."""
    groups = {g.id: g for g in await ChatGroup.find(groups_of(user)).to_list()}
    if not groups:
        return []
    rows = await ClientApproval.find({"group_id": {"$in": list(groups)}, "status": "pending"}).sort("+created_at").limit(limit).to_list()
    files = {f.id: f for f in await File.find({"_id": {"$in": unique(i for a in rows for i in a.file_ids)}}).to_list()}
    return [
        ApprovalItem(approval=approval_out(a, files, lambda uid: None), group_id=a.group_id, group_name=groups[a.group_id].name, message_id=a.message_id)
        for a in rows
    ]


async def admin_dashboard(user: User) -> AdminDashboard:
    today = today_local().isoformat()
    tasks = await Task.find_all().to_list()
    is_open = lambda t: t.status in OPEN_STATUSES  # noqa: E731
    overdue = lambda t: is_open(t) and t.due_date is not None and t.due_date < today  # noqa: E731

    counts = TaskCounts(
        overdue=sum(1 for t in tasks if overdue(t)),
        due_today=sum(1 for t in tasks if is_open(t) and t.due_date == today),
        in_review=sum(1 for t in tasks if t.status == "submitted"),
        running=await TimeLog.find(TimeLog.running == True).count(),  # noqa: E712
        open=sum(1 for t in tasks if is_open(t)),
        total=len(tasks),
    )

    by_project: dict = defaultdict(list)
    for t in tasks:
        by_project[t.project_id].append(t)
    health = []
    for p in await Project.find_all().sort("name").to_list():
        ts = by_project.get(p.id, [])
        approved = sum(1 for t in ts if t.status == "approved")
        health.append(
            ProjectHealth(
                id=p.id,
                name=p.name,
                open=sum(1 for t in ts if is_open(t)),
                overdue=sum(1 for t in ts if overdue(t)),
                in_review=sum(1 for t in ts if t.status == "submitted"),
                changes_requested=sum(1 for t in ts if t.status == "changes_requested"),
                total=len(ts),
                progress=round(100 * approved / len(ts)) if ts else 0,
            )
        )

    per_user: dict = defaultdict(lambda: [0, 0])
    for t in tasks:
        if is_open(t):
            per_user[t.assignee_id][0] += 1
            if overdue(t):
                per_user[t.assignee_id][1] += 1
    log = await TaskActivity.find_all().sort("-created_at").limit(8).to_list()
    task_titles = {t.id: t.title for t in tasks}
    people = await load_users([*per_user, *(a.author_id for a in log)])
    workload = [
        WorkloadRow(user=brief(people[uid]), open=o, overdue=od)
        for uid, (o, od) in sorted(per_user.items(), key=lambda kv: (-kv[1][0], str(kv[0])))
        if uid in people and people[uid].is_active
    ][:8]

    lo, hi = _day_bounds_utc(today_local())
    meetings = await Booking.find(Booking.start < hi, Booking.end > lo).sort("+start").to_list()
    return AdminDashboard(
        tasks=counts,
        projects=health,
        approvals=await oldest_pending_approvals(user),
        workload=workload,
        meetings=[BookingOut.model_validate(b, from_attributes=True) for b in meetings],
        activity=[
            ActivityRow(
                id=a.id,
                kind=a.kind,
                text=a.text or a.body,
                author=brief(people[a.author_id]) if a.author_id in people else None,
                task_id=a.task_id,
                task_title=task_titles.get(a.task_id) if a.task_id else None,
                project_id=a.project_id,
                subfolder_id=a.subfolder_id,
                created_at=as_utc(a.created_at),
            )
            for a in log
        ],
    )


async def my_bookings(user: User, limit: int = 20) -> list[Booking]:
    """Meetings I host or booked that have not ended yet, soonest first."""
    now = datetime.now(timezone.utc)
    return await Booking.find(
        {"$or": [{"host_user_id": user.id}, {"booked_by": user.id}], "end": {"$gt": now}}
    ).sort("+start").limit(limit).to_list()
