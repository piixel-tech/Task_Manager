import re
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import can, require
from app.models import Project, Subfolder, User
from app.models.requirement import Requirement, Version
from app.schemas.requirement import RequirementCreate, RequirementDetail, RequirementList, RequirementUpdate
from app.services.checklist import delete_files
from app.services.projects import get_project_or_404, subfolders_of, unique
from app.services.requirements import (
    requirement_detail,
    requirement_outs,
    tell_watchers,
)
from app.services.tasks import check_assets

router = APIRouter(tags=["requirements"])


def _check_tag(subfolder_id: PydanticObjectId | None, siblings: list[Subfolder]) -> None:
    if subfolder_id is not None and subfolder_id not in {s.id for s in siblings}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That subfolder is not part of this project")


async def _project_ctx(project_id: PydanticObjectId, user: User, action: str, **ctx) -> tuple[Project, list[Subfolder]]:
    project = await get_project_or_404(project_id)
    siblings = await subfolders_of(project.id)
    require(user, action, siblings=siblings, project=project, **ctx)
    return project, siblings


async def _get_or_404(requirement_id: PydanticObjectId) -> Requirement:
    req = await Requirement.get(requirement_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Requirement not found")
    return req


@router.get("/projects/{project_id}/requirements", response_model=RequirementList)
async def list_requirements(
    project_id: PydanticObjectId,
    q: str | None = Query(None, max_length=100, description="Search the title and details"),
    subfolder_id: PydanticObjectId | None = Query(None, description="Only requirements tagged with this subfolder"),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
) -> RequirementList:
    """Newest first. The client, admins and everyone on the project can read them."""
    project, siblings = await _project_ctx(project_id, user, "requirement.view")
    query: dict = {"project_id": project.id}
    if subfolder_id:
        query["subfolder_id"] = subfolder_id
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"title": rx}, {"details": rx}]
    total = await Requirement.find(query).count()
    rows = await Requirement.find(query).sort([("created_at", -1), ("_id", -1)]).skip(skip).limit(limit).to_list()
    return RequirementList(
        total=total,
        can_add=can(user, "requirement.add", siblings=siblings, project=project),
        items=await requirement_outs(rows, user, project, siblings),
    )


@router.post("/projects/{project_id}/requirements", response_model=RequirementDetail, status_code=status.HTTP_201_CREATED)
async def add_requirement(project_id: PydanticObjectId, body: RequirementCreate, user: User = Depends(get_current_user)) -> RequirementDetail:
    """The client, an admin, or a head of any subfolder in the project adds to the record."""
    project, siblings = await _project_ctx(project_id, user, "requirement.add")
    _check_tag(body.subfolder_id, siblings)
    await check_assets(body.attachment_ids, user)
    req = await Requirement(
        project_id=project.id,
        subfolder_id=body.subfolder_id,
        title=body.title,
        details=body.details,
        attachment_ids=unique(body.attachment_ids),
        created_by=user.id,
    ).insert()
    await tell_watchers(
        project, siblings, user, type="requirement_added", title=f"New requirement: {req.title}", body=f"{user.name} added it to {project.name}."
    )
    return await requirement_detail(req, user, project, siblings)


@router.get("/requirements/{requirement_id}", response_model=RequirementDetail)
async def get_requirement(requirement_id: PydanticObjectId, user: User = Depends(get_current_user)) -> RequirementDetail:
    """One requirement with every earlier version of it."""
    req = await _get_or_404(requirement_id)
    project, siblings = await _project_ctx(req.project_id, user, "requirement.view")
    return await requirement_detail(req, user, project, siblings)


@router.patch("/requirements/{requirement_id}", response_model=RequirementDetail)
async def edit_requirement(requirement_id: PydanticObjectId, body: RequirementUpdate, user: User = Depends(get_current_user)) -> RequirementDetail:
    """Only the author. The version being replaced is kept in the history."""
    req = await _get_or_404(requirement_id)
    project, siblings = await _project_ctx(req.project_id, user, "requirement.edit", creator_id=req.created_by)
    sent = body.model_fields_set

    title = body.title if body.title is not None else req.title
    details = req.details if body.details is None else body.details.strip()
    attachments = req.attachment_ids if body.attachment_ids is None else unique(body.attachment_ids)
    tag = body.subfolder_id if "subfolder_id" in sent else req.subfolder_id
    if not details and not attachments:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Write some details or attach a file or link")
    _check_tag(tag, siblings)
    new_files = [a for a in attachments if a not in req.attachment_ids]
    await check_assets(new_files, user)

    if (title, details, attachments, tag) != (req.title, req.details, req.attachment_ids, req.subfolder_id):
        now = datetime.now(timezone.utc)
        snapshot = Version(
            title=req.title,
            details=req.details,
            attachment_ids=req.attachment_ids,
            subfolder_id=req.subfolder_id,
            edited_by=req.created_by,
            edited_at=req.updated_at,
        )
        await Requirement.find({"_id": req.id}).update(
            {
                "$push": {"history": snapshot.model_dump()},
                "$set": {"title": title, "details": details, "attachment_ids": attachments, "subfolder_id": tag, "updated_at": now},
            }
        )
        await tell_watchers(
            project, siblings, user, type="requirement_updated", title=f"Requirement updated: {title}", body=f"{user.name} edited it in {project.name}."
        )
        req = await _get_or_404(req.id)
    return await requirement_detail(req, user, project, siblings)


@router.delete("/requirements/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_requirement(requirement_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Admin only. Removes the requirement, its history and every file ever attached to it."""
    require(user, "requirement.delete")
    req = await _get_or_404(requirement_id)
    project = await get_project_or_404(req.project_id)
    siblings = await subfolders_of(project.id)
    files = unique([*req.attachment_ids, *(a for v in req.history for a in v.attachment_ids)])
    await req.delete()
    await delete_files(files)
    await tell_watchers(
        project, siblings, user, type="requirement_deleted", title=f"Requirement deleted: {req.title}",
        body=f"{user.name} deleted it from {project.name}.", extra=[req.created_by],
    )
