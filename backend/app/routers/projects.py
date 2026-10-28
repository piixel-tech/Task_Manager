from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.core.permissions import can, require
from app.models import User
from app.models.project import Project, Subfolder
from app.schemas.project import (
    ProjectCreate,
    ProjectDetail,
    ProjectOut,
    ProjectUpdate,
    SubfolderCreate,
    SubfolderOut,
)
from app.services.projects import (
    check_clients,
    check_company,
    check_staff,
    get_project_or_404,
    load_users,
    brief,
    notify_people,
    project_ids_for_staff,
    project_out,
    subfolder_out,
    subfolders_of,
    unique,
    with_heads_as_members,
)
from app.services.trash import trash_project

router = APIRouter(prefix="/projects", tags=["projects"])


async def _detail(project: Project, viewer: User) -> ProjectDetail:
    subs = await subfolders_of(project.id)
    clients = await load_users(project.client_ids)
    return ProjectDetail(
        **project_out(project, subs, viewer).model_dump(),
        clients=[brief(clients[i]) for i in project.client_ids if i in clients],
        subfolders=[await subfolder_out(s, subs, viewer) for s in subs],
    )


async def _create_subfolder(project: Project, body: SubfolderCreate, actor: User) -> Subfolder:
    await check_staff([*body.head_ids, *body.member_ids], "head or member")
    sub = Subfolder(
        project_id=project.id,
        name=body.name.strip(),
        head_ids=unique(body.head_ids),
        member_ids=with_heads_as_members(body.head_ids, body.member_ids),
        created_by=actor.id,
    )
    await sub.insert()
    return sub


@router.get("", response_model=list[ProjectOut])
async def list_projects(user: User = Depends(get_current_user)) -> list[ProjectOut]:
    """Admins see every project; team members see the projects they belong to."""
    if user.role == "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    if user.role == "admin":
        projects = await Project.find_all().sort("-created_at").to_list()
    else:
        ids = await project_ids_for_staff(user)
        projects = await Project.find({"_id": {"$in": ids}}).sort("-created_at").to_list()
    return [project_out(p, await subfolders_of(p.id), user) for p in projects]


@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, user: User = Depends(get_current_user)) -> ProjectDetail:
    """Admin only: a project always starts with its first subfolder and at least one head."""
    require(user, "project.create")
    await check_company(body.company_id)
    await check_clients(body.client_ids)

    project = Project(
        name=body.name.strip(), company_id=body.company_id, client_ids=unique(body.client_ids), created_by=user.id
    )
    await project.insert()
    try:
        sub = await _create_subfolder(project, body.first_subfolder, user)
    except BaseException:
        await project.delete()  # no half-created project
        raise

    await notify_people(
        sub.member_ids,
        type="project_added",
        title=f"You were added to {project.name}",
        body=f"Subfolder: {sub.name}.",
        project_id=project.id,
        subfolder_id=sub.id,
        actor=user,
    )
    return await _detail(project, user)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: PydanticObjectId, user: User = Depends(get_current_user)) -> ProjectDetail:
    project = await get_project_or_404(project_id)
    require(user, "subfolder.view", siblings=await subfolders_of(project.id))
    return await _detail(project, user)


@router.patch("/{project_id}", response_model=ProjectDetail)
async def update_project(
    project_id: PydanticObjectId, body: ProjectUpdate, user: User = Depends(get_current_user)
) -> ProjectDetail:
    require(user, "project.edit")
    project = await get_project_or_404(project_id)
    old_name, old_clients = project.name, set(project.client_ids)

    if body.company_id is not None:
        await check_company(body.company_id)
        project.company_id = body.company_id
    if body.client_ids is not None:
        await check_clients(body.client_ids)
        project.client_ids = unique(body.client_ids)
    if body.name is not None:
        project.name = body.name.strip()
    await project.save()

    subs = await subfolders_of(project.id)
    team = [uid for s in subs for uid in s.member_ids]
    if project.name != old_name:
        await notify_people(
            team,
            type="project_renamed",
            title="Project renamed",
            body=f"{old_name} is now {project.name}.",
            project_id=project.id,
            actor=user,
        )
    added_clients = set(project.client_ids) - old_clients
    if added_clients:
        await notify_people(
            added_clients,
            type="project_added",
            title=f"You were added to {project.name}",
            body="You now have access to this project.",
            project_id=project.id,
            actor=user,
        )
    return await _detail(project, user)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    require(user, "project.delete")
    project = await get_project_or_404(project_id)
    subs = await subfolders_of(project.id)
    affected = [uid for s in subs for uid in s.member_ids] + list(project.client_ids)

    await trash_project(project, user)  # everything in it waits in the Trash for 30 days

    await notify_people(
        affected,
        type="project_deleted",
        title="Project deleted",
        body=f"{project.name} was deleted.",
        project_id=project.id,
        actor=user,
    )


@router.post("/{project_id}/subfolders", response_model=SubfolderOut, status_code=status.HTTP_201_CREATED)
async def create_subfolder(
    project_id: PydanticObjectId, body: SubfolderCreate, user: User = Depends(get_current_user)
) -> SubfolderOut:
    """Admin, or a head of any subfolder in this project. Creating one gives the creator no edit
    rights on it unless they appoint themselves head."""
    project = await get_project_or_404(project_id)
    siblings = await subfolders_of(project.id)
    require(user, "subfolder.create" if siblings else "subfolder.create_first", siblings=siblings)

    sub = await _create_subfolder(project, body, user)
    await notify_people(
        sub.member_ids,
        type="subfolder_added",
        title=f"You were added to {sub.name}",
        body=f"New subfolder in {project.name}.",
        project_id=project.id,
        subfolder_id=sub.id,
        actor=user,
    )
    await notify_people(
        sub.head_ids,
        type="head_appointed",
        title=f"You are head of {sub.name}",
        body=f"You can manage this subfolder in {project.name}.",
        project_id=project.id,
        subfolder_id=sub.id,
        actor=user,
    )
    return await subfolder_out(sub, [*siblings, sub], user)
