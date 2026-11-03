from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import require_role
from app.core.timeutil import today_local
from app.models import DeliverablePlan, Project, Subfolder, User
from app.models.requirement import Requirement
from app.routers.approvals import list_approvals
from app.schemas.deliverable import MONTH_RE
from app.schemas.portal import (
    DeliverablesTotals,
    PortalDeliverables,
    PortalPerson,
    PortalProject,
    PortalSummary,
    ProjectProgress,
    Ref,
)
from app.services.checklist import deliverables_out
from app.services.projects import brief, load_users, unique
from app.services.requirements import requirement_outs

router = APIRouter(prefix="/portal", tags=["portal"])
only_clients = require_role("client")

SUMMARY_ITEMS = 3


async def _projects(user: User) -> list[tuple[Project, list[Subfolder]]]:
    projects = await Project.find({"client_ids": user.id}).sort("name").to_list()
    subs = await Subfolder.find({"project_id": {"$in": [p.id for p in projects]}}).sort("+created_at").to_list()
    return [(p, [s for s in subs if s.project_id == p.id]) for p in projects]


@router.get("/projects", response_model=list[PortalProject])
async def my_projects(user: User = Depends(only_clients)) -> list[PortalProject]:
    """The projects this client belongs to, with their subfolders and the team they can book meetings with."""
    mine = await _projects(user)
    people = await load_users(uid for _, subs in mine for s in subs for uid in (*s.head_ids, *s.member_ids))
    out = []
    for project, subs in mine:
        heads = {h for s in subs for h in s.head_ids}
        team = unique(uid for s in subs for uid in (*s.head_ids, *s.member_ids))
        out.append(
            PortalProject(
                id=project.id,
                name=project.name,
                company_id=project.company_id,
                subfolders=[Ref(id=s.id, name=s.name) for s in subs],
                team=[
                    PortalPerson(user=brief(people[u]), is_head=u in heads)
                    for u in team
                    if u in people and people[u].is_active and people[u].role != "client"
                ],
            )
        )
    return out


async def _month_outs(user: User, month: str) -> list[PortalDeliverables]:
    mine = await _projects(user)
    plans = {
        p.subfolder_id: p
        for p in await DeliverablePlan.find(
            {"subfolder_id": {"$in": [s.id for _, subs in mine for s in subs]}, "month": month}
        ).to_list()
    }
    out = []
    for project, subs in mine:
        for sub in subs:
            data = await deliverables_out(sub, month, plans.get(sub.id), user)
            if data.total:  # subfolders with nothing planned this month would only be noise
                out.append(
                    PortalDeliverables(
                        project=Ref(id=project.id, name=project.name),
                        subfolder=Ref(id=sub.id, name=sub.name),
                        deliverables=data,
                    )
                )
    return out


@router.get("/deliverables", response_model=list[PortalDeliverables])
async def deliverables(
    month: str | None = None,
    user: User = Depends(only_clients),
) -> list[PortalDeliverables]:
    """Read-only tracker: every subfolder of the client's projects that has deliverables in this month (YYYY-MM)."""
    return await _month_outs(user, _valid_month(month))


def _valid_month(month: str | None) -> str:
    month = month or today_local().strftime("%Y-%m")
    if not MONTH_RE.match(month):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "month must look like 2026-11")
    return month


def _position(d) -> float:
    """How many items' worth of progress a subfolder has: each item counts its place along that subfolder's own stages (0 to 1)."""
    top = len(d.stages) - 1
    return sum(d.stages.index(key) * n for key, n in d.by_stage.items() if key in d.stages) / top if top > 0 else 0.0


@router.get("/summary", response_model=PortalSummary)
async def summary(month: str | None = None, user: User = Depends(only_clients)) -> PortalSummary:
    """Everything the portal home shows: waiting approvals, this month's deliverables, the latest requirements."""
    month = _valid_month(month)
    pending = await list_approvals("pending", user)

    groups = await _month_outs(user, month)
    items = [d.deliverables for d in groups]
    total = sum(d.total for d in items)
    done = sum(d.done for d in items)
    progress = round(100 * sum(_position(d) for d in items) / total) if total else 0

    # Subfolders can have different stages, so the breakdown is by stage name.
    stages: dict[str, int] = {}
    for d in items:
        for key, n in d.by_stage.items():
            name = d.stage_labels.get(key, key)
            stages[name] = stages.get(name, 0) + n
    per_project: dict = {}
    for g in groups:
        row = per_project.setdefault(g.project.id, [g.project.name, 0, 0, 0.0])
        row[1] += g.deliverables.total
        row[2] += g.deliverables.done
        row[3] += _position(g.deliverables)
    project_progress = [
        ProjectProgress(id=pid, name=n, total=t, done=dn, progress=round(100 * pos / t) if t else 0)
        for pid, (n, t, dn, pos) in per_project.items()
    ]

    latest = []
    for project, subs in await _projects(user):
        rows = await Requirement.find(Requirement.project_id == project.id).sort([("created_at", -1), ("_id", -1)]).limit(SUMMARY_ITEMS).to_list()
        latest += await requirement_outs(rows, user, project, subs)
    latest.sort(key=lambda r: r.created_at, reverse=True)

    return PortalSummary(
        month=month,
        pending_approvals=len(pending),
        approvals=pending[:SUMMARY_ITEMS],
        deliverables=DeliverablesTotals(total=total, done=done, remaining=total - done, progress=progress),
        latest_requirements=latest[:SUMMARY_ITEMS],
        stages=stages,
        projects=project_progress,
    )
