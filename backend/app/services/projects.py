"""Shared helpers for the projects and subfolders routers."""
from typing import Iterable

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.permissions import can
from app.core.timeutil import as_utc
from app.models import Company, User
from app.models.project import Project, Subfolder
from app.schemas.project import ProjectOut, SubfolderOut, UserBrief
from app.services.focus import in_focus
from app.services.notify import notify


def unique(ids: Iterable[PydanticObjectId]) -> list[PydanticObjectId]:
    return list(dict.fromkeys(ids))


def brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id,
        name=user.name,
        avatar_url=user.avatar_url,
        role=user.role,
        company_id=user.company_id,
        focus_until=as_utc(user.focus_until) if in_focus(user) else None,
    )


async def load_users(ids: Iterable[PydanticObjectId]) -> dict[PydanticObjectId, User]:
    ids = unique(ids)
    if not ids:
        return {}
    return {u.id: u for u in await User.find({"_id": {"$in": ids}}).to_list()}


async def check_staff(ids: Iterable[PydanticObjectId], label: str) -> None:
    """Heads and members must be active admins or employees."""
    ids = unique(ids)
    found = await load_users(ids)
    for uid in ids:
        u = found.get(uid)
        if u is None or not u.is_active or u.role not in ("admin", "employee"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Invalid {label}: every person must be an active team member")


async def check_clients(ids: Iterable[PydanticObjectId]) -> None:
    ids = unique(ids)
    found = await load_users(ids)
    for uid in ids:
        u = found.get(uid)
        if u is None or not u.is_active or u.role != "client":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid client: every client must be an active client account")


async def check_company(company_id: PydanticObjectId) -> None:
    if await Company.get(company_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Company not found")


def with_heads_as_members(head_ids: list[PydanticObjectId], member_ids: list[PydanticObjectId]) -> list[PydanticObjectId]:
    """Invariant: every head is also a member."""
    return unique([*head_ids, *member_ids])


async def subfolders_of(project_id: PydanticObjectId) -> list[Subfolder]:
    return await Subfolder.find(Subfolder.project_id == project_id).sort("+created_at").to_list()


async def get_project_or_404(project_id: PydanticObjectId) -> Project:
    project = await Project.get(project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def get_subfolder_or_404(subfolder_id: PydanticObjectId) -> Subfolder:
    sub = await Subfolder.get(subfolder_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subfolder not found")
    return sub


async def project_ids_for_staff(user: User) -> list[PydanticObjectId]:
    """Projects a staff user belongs to (member or head of any of their subfolders)."""
    subs = await Subfolder.find({"$or": [{"member_ids": user.id}, {"head_ids": user.id}]}).to_list()
    return unique(s.project_id for s in subs)


async def client_team_ids(user: User) -> set[PydanticObjectId]:
    """Everyone on the projects this client belongs to: who they may see and book."""
    if user.role != "client":
        return set()
    projects = await Project.find({"client_ids": user.id}).to_list()
    if not projects:
        return set()
    subs = await Subfolder.find({"project_id": {"$in": [p.id for p in projects]}}).to_list()
    return {uid for s in subs for uid in (*s.head_ids, *s.member_ids)}


async def subfolder_out(sub: Subfolder, siblings: list[Subfolder], viewer: User) -> SubfolderOut:
    people = await load_users([*sub.head_ids, *sub.member_ids])
    return SubfolderOut(
        id=sub.id,
        project_id=sub.project_id,
        name=sub.name,
        heads=[brief(people[i]) for i in sub.head_ids if i in people],
        members=[brief(people[i]) for i in sub.member_ids if i in people],
        created_by=sub.created_by,
        created_at=sub.created_at,
        can_edit=can(viewer, "subfolder.edit", sub, siblings=siblings),
        viewer_is_head=viewer.id in sub.head_ids,
    )


def project_out(project: Project, siblings: list[Subfolder], viewer: User) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        company_id=project.company_id,
        client_ids=project.client_ids,
        created_by=project.created_by,
        created_at=project.created_at,
        subfolder_count=len(siblings),
        can_edit=can(viewer, "project.edit"),
        can_create_subfolder=can(viewer, "subfolder.create", siblings=siblings),
    )


async def notify_people(
    user_ids: Iterable[PydanticObjectId],
    *,
    type: str,
    title: str,
    body: str,
    project_id: PydanticObjectId,
    subfolder_id: PydanticObjectId | None = None,
    actor: User,
    tab: str | None = None,
) -> None:
    """notify() with a link that matches each recipient's area of the app. The actor isn't told about their own action."""
    ids = [i for i in unique(user_ids) if i != actor.id]
    people = await load_users(ids)
    by_prefix: dict[str, list[PydanticObjectId]] = {}
    for uid, u in people.items():
        if not u.is_active:
            continue
        prefix = "/admin" if u.role == "admin" else "/client" if u.role == "client" else "/app"
        by_prefix.setdefault(prefix, []).append(uid)
    for prefix, uids in by_prefix.items():
        if prefix == "/client":
            link = "/client/portal"
        else:
            link = f"{prefix}/projects/{project_id}" + (f"/subfolders/{subfolder_id}" if subfolder_id else "")
            if tab:
                link += f"?tab={tab}"
        await notify(uids, type=type, title=title, body=body, link=link, actor_id=actor.id)
