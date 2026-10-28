from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.core.permissions import can, require
from app.models import ChecklistItem, File, Subfolder, User
from app.schemas.checklist import AttachBody, ChecklistItemCreate, ChecklistItemOut, ChecklistItemUpdate, ChecklistOut
from app.services.checklist import checklist_outs, delete_files, team_of
from app.services.projects import get_subfolder_or_404, notify_people, subfolders_of, unique
from app.services.tasks import check_assets

router = APIRouter(tags=["checklist"])


async def _ping(sub: Subfolder, user: User, body: str) -> None:
    """Tell the subfolder's team (not the actor) about a change."""
    await notify_people(
        team_of(sub),
        type="checklist_updated",
        title=f"Checklist: {sub.name}",
        body=body,
        project_id=sub.project_id,
        subfolder_id=sub.id,
        actor=user,
        tab="checklist",
    )


async def _item_and_sub(item_id: PydanticObjectId) -> tuple[ChecklistItem, Subfolder]:
    item = await ChecklistItem.get(item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Checklist item not found")
    return item, await get_subfolder_or_404(item.subfolder_id)


async def _one(item_id: PydanticObjectId, sub: Subfolder, user: User) -> ChecklistItemOut:
    return (await checklist_outs([await ChecklistItem.get(item_id)], sub, user))[0]


@router.get("/subfolders/{subfolder_id}/checklist", response_model=ChecklistOut)
async def get_checklist(subfolder_id: PydanticObjectId, user: User = Depends(get_current_user)) -> ChecklistOut:
    """Everyone in the project can read it; members (and admins) can change it."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "checklist.view", sub, siblings=await subfolders_of(sub.project_id))
    items = await ChecklistItem.find(ChecklistItem.subfolder_id == sub.id).sort("created_at").to_list()
    return ChecklistOut(
        can_write=can(user, "checklist.write", sub),
        can_manage=can(user, "deliverable.edit", sub),
        items=await checklist_outs(items, sub, user),
    )


@router.post("/subfolders/{subfolder_id}/checklist", response_model=ChecklistItemOut, status_code=status.HTTP_201_CREATED)
async def add_item(subfolder_id: PydanticObjectId, body: ChecklistItemCreate, user: User = Depends(get_current_user)) -> ChecklistItemOut:
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "checklist.write", sub)
    await check_assets(body.attachment_ids, user)
    item = ChecklistItem(subfolder_id=sub.id, text=body.text, created_by=user.id, attachment_ids=unique(body.attachment_ids))
    await item.insert()
    await _ping(sub, user, f"{user.name} added “{item.text}”.")
    return await _one(item.id, sub, user)


@router.patch("/checklist/{item_id}", response_model=ChecklistItemOut)
async def edit_item(item_id: PydanticObjectId, body: ChecklistItemUpdate, user: User = Depends(get_current_user)) -> ChecklistItemOut:
    """Change the text. Only the person who added the item can; heads and admins may delete it but not reword it."""
    item, sub = await _item_and_sub(item_id)
    require(user, "checklist.write", sub)
    if item.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own items")
    if body.text != item.text:
        await ChecklistItem.find({"_id": item.id}).update({"$set": {"text": body.text, "updated_at": datetime.now(timezone.utc)}})
        await _ping(sub, user, f"{user.name} edited “{item.text}” to “{body.text}”.")
    return await _one(item.id, sub, user)


@router.post("/checklist/{item_id}/attachments", response_model=ChecklistItemOut)
async def attach(item_id: PydanticObjectId, body: AttachBody, user: User = Depends(get_current_user)) -> ChecklistItemOut:
    """Attach files or links you uploaded through the file service."""
    item, sub = await _item_and_sub(item_id)
    require(user, "checklist.write", sub)
    new = [f for f in unique(body.file_ids) if f not in item.attachment_ids]
    await check_assets(new, user)
    if new:
        await ChecklistItem.find({"_id": item.id}).update({"$push": {"attachment_ids": {"$each": new}}})
        await _ping(sub, user, f"{user.name} attached {len(new)} to “{item.text}”.")
    return await _one(item.id, sub, user)


@router.delete("/checklist/{item_id}/attachments/{file_id}", response_model=ChecklistItemOut)
async def detach(item_id: PydanticObjectId, file_id: PydanticObjectId, user: User = Depends(get_current_user)) -> ChecklistItemOut:
    """Whoever attached it, a head or an admin can remove it. The file is deleted too."""
    item, sub = await _item_and_sub(item_id)
    require(user, "checklist.write", sub)
    if file_id not in item.attachment_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That file is not attached to this item")
    f = await File.get(file_id)
    if f and f.owner_id != user.id:
        require(user, "deliverable.edit", sub)
    await ChecklistItem.find({"_id": item.id}).update({"$pull": {"attachment_ids": file_id}})
    await delete_files([file_id])
    await _ping(sub, user, f"{user.name} removed an attachment from “{item.text}”.")
    return await _one(item.id, sub, user)


@router.delete("/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """The person who added it, a head or an admin."""
    item, sub = await _item_and_sub(item_id)
    require(user, "checklist.write", sub)
    if item.created_by != user.id:
        require(user, "deliverable.edit", sub)
    await delete_files(item.attachment_ids)
    await item.delete()
    await _ping(sub, user, f"{user.name} deleted “{item.text}”.")
