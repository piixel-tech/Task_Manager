from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.core.permissions import can, require
from app.models import File, User
from app.schemas.file import FileOut
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


class SubfolderFiles(BaseModel):
    can_write: bool
    files: list[FileOut]


class FileRef(BaseModel):
    file_id: PydanticObjectId


async def _files_out(sub, user: User) -> SubfolderFiles:
    from app.integrations.google.workspace import drive_files_of

    return SubfolderFiles(
        can_write=can(user, "checklist.write", sub),
        files=[FileOut.model_validate(f, from_attributes=True) for f in await drive_files_of(sub.file_ids)],
    )


@router.get("/{subfolder_id}/files", response_model=SubfolderFiles)
async def list_subfolder_files(subfolder_id: PydanticObjectId, user: User = Depends(get_current_user)) -> SubfolderFiles:
    """Google Docs, Sheets and Drive files linked to the subfolder. Anyone who can open the subfolder sees the links."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "subfolder.view", sub, siblings=await subfolders_of(sub.project_id))
    return await _files_out(sub, user)


@router.post("/{subfolder_id}/files", response_model=SubfolderFiles, status_code=status.HTTP_201_CREATED)
async def link_subfolder_file(subfolder_id: PydanticObjectId, body: FileRef, user: User = Depends(get_current_user)) -> SubfolderFiles:
    """Link a Drive file (picked or just created through the Google routes) to the subfolder. Members and admins."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "checklist.write", sub)
    file = await File.get(body.file_id)
    if file is None or file.drive is None or (file.owner_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a file from Google Drive or create one first")
    if file.id not in sub.file_ids:
        sub.file_ids = [*sub.file_ids, file.id]
        await sub.save()
        project = await get_project_or_404(sub.project_id)
        await notify_people(
            sub.member_ids,
            type="subfolder_file_added",
            title=f"New Google file in {sub.name}",
            body=f"{user.name} added {file.name}.",
            project_id=project.id,
            subfolder_id=sub.id,
            actor=user,
        )
    return await _files_out(sub, user)


@router.delete("/{subfolder_id}/files/{file_id}", response_model=SubfolderFiles)
async def unlink_subfolder_file(
    subfolder_id: PydanticObjectId, file_id: PydanticObjectId, user: User = Depends(get_current_user)
) -> SubfolderFiles:
    """Take the link off the subfolder. The file itself stays in Google Drive."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "checklist.write", sub)
    if file_id not in sub.file_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That file isn't linked to this subfolder")
    sub.file_ids = [i for i in sub.file_ids if i != file_id]
    await sub.save()
    file = await File.get(file_id)  # the link record stays: a task or a chat message may point at the same file
    project = await get_project_or_404(sub.project_id)
    await notify_people(
        sub.member_ids,
        type="subfolder_file_removed",
        title=f"Google file removed from {sub.name}",
        body=f"{user.name} removed {file.name if file else 'a file'}.",
        project_id=project.id,
        subfolder_id=sub.id,
        actor=user,
    )
    return await _files_out(sub, user)


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
