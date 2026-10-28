from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import User
from app.schemas.project import SubfolderOut, SubfolderUpdate
from app.services.trash import trash_subfolder
from app.services.projects import (
    check_staff,
    get_project_or_404,
    get_subfolder_or_404,
    notify_people,
    subfolder_out,
    subfolders_of,
    unique,
    with_heads_as_members,
)

router = APIRouter(prefix="/subfolders", tags=["subfolders"])


@router.get("/{subfolder_id}", response_model=SubfolderOut)
async def get_subfolder(subfolder_id: PydanticObjectId, user: User = Depends(get_current_user)) -> SubfolderOut:
    """Admins and project members can open any subfolder in the project; `can_edit` says who may change it."""
    sub = await get_subfolder_or_404(subfolder_id)
    siblings = await subfolders_of(sub.project_id)
    require(user, "subfolder.view", sub, siblings=siblings)
    return await subfolder_out(sub, siblings, user)


@router.patch("/{subfolder_id}", response_model=SubfolderOut)
async def update_subfolder(
    subfolder_id: PydanticObjectId, body: SubfolderUpdate, user: User = Depends(get_current_user)
) -> SubfolderOut:
    """Name, members and heads. Admin, or a head of this subfolder."""
    sub = await get_subfolder_or_404(subfolder_id)
    siblings = await subfolders_of(sub.project_id)
    require(user, "subfolder.edit", sub, siblings=siblings)
    project = await get_project_or_404(sub.project_id)

    old_name, old_heads, old_members = sub.name, set(sub.head_ids), set(sub.member_ids)

    heads = unique(body.head_ids) if body.head_ids is not None else list(sub.head_ids)
    members = unique(body.member_ids) if body.member_ids is not None else list(sub.member_ids)
    await check_staff([*heads, *members], "head or member")

    sub.head_ids = heads
    sub.member_ids = with_heads_as_members(heads, members)
    if body.name is not None:
        sub.name = body.name.strip()
    await sub.save()

    now_heads, now_members = set(sub.head_ids), set(sub.member_ids)
    added = now_members - old_members
    appointed = now_heads - old_heads
    removed = old_members - now_members

    ctx = {"project_id": project.id, "subfolder_id": sub.id, "actor": user}
    await notify_people(
        added, type="subfolder_added", title=f"You were added to {sub.name}", body=f"Project: {project.name}.", **ctx
    )
    await notify_people(
        appointed - added,
        type="head_appointed",
        title=f"You are now head of {sub.name}",
        body=f"Project: {project.name}.",
        **ctx,
    )
    await notify_people(
        removed,
        type="subfolder_removed",
        title=f"You were removed from {sub.name}",
        body=f"Project: {project.name}.",
        project_id=project.id,
        actor=user,
    )
    if sub.name != old_name:
        await notify_people(
            (old_members & now_members) - appointed,
            type="subfolder_renamed",
            title="Subfolder renamed",
            body=f"{old_name} is now {sub.name}.",
            **ctx,
        )
    return await subfolder_out(sub, siblings, user)


@router.delete("/{subfolder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subfolder(subfolder_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Admin, or a head of this subfolder. Takes its tasks, checklist, deliverables and mid-way changes with it, into the
    Trash for 30 days. A project always keeps at least one subfolder."""
    sub = await get_subfolder_or_404(subfolder_id)
    siblings = await subfolders_of(sub.project_id)
    require(user, "subfolder.delete", sub, siblings=siblings)
    if len(siblings) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "A project needs at least one subfolder. Delete the project instead.")
    project = await get_project_or_404(sub.project_id)

    await trash_subfolder(sub, user)  # the tasks, checklist and deliverables go with it; requirements and chats keep their place but lose the link

    await notify_people(
        sub.member_ids,
        type="subfolder_deleted",
        title=f"Subfolder deleted: {sub.name}",
        body=f"{user.name} deleted it from {project.name}.",
        project_id=project.id,
        actor=user,
    )
