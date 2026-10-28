"""Admin: the Trash. Deleted tasks, subfolders, projects and chat messages wait here for 30 days."""
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.deps import require_role
from app.core.timeutil import as_utc
from app.models import TrashItem
from app.models.trash import TrashKind
from app.schemas.project import UserBrief
from app.services.projects import brief, load_users
from app.services.trash import purge, purge_expired, restore

router = APIRouter(prefix="/trash", tags=["trash"], dependencies=[Depends(require_role("admin"))])


class TrashOut(BaseModel):
    id: PydanticObjectId
    kind: TrashKind
    title: str
    context: str
    deleted_by: UserBrief | None
    deleted_at: datetime
    expires_at: datetime
    days_left: int


class TrashPage(BaseModel):
    items: list[TrashOut]
    total: int


class Restored(BaseModel):
    restored: TrashKind


@router.get("", response_model=TrashPage)
async def list_trash(kind: TrashKind | None = None, limit: int = Query(50, ge=1, le=200), skip: int = Query(0, ge=0)) -> TrashPage:
    """Newest first. Anything past its 30 days is purged before the list is built."""
    await purge_expired()
    query = TrashItem.find({"kind": kind} if kind else {})
    total = await query.count()
    rows = await query.sort("-deleted_at").skip(skip).limit(limit).to_list()
    people = await load_users(r.deleted_by for r in rows if r.deleted_by)
    now = datetime.now(timezone.utc)
    return TrashPage(
        total=total,
        items=[
            TrashOut(
                id=r.id,
                kind=r.kind,
                title=r.title,
                context=r.context,
                deleted_by=brief(people[r.deleted_by]) if r.deleted_by in people else None,
                deleted_at=as_utc(r.deleted_at),
                expires_at=as_utc(r.expires_at),
                days_left=max(0, (as_utc(r.expires_at) - now).days),
            )
            for r in rows
        ],
    )


async def _get(item_id: PydanticObjectId) -> TrashItem:
    item = await TrashItem.get(item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That item is not in the trash (it may have been restored or purged)")
    return item


@router.post("/{item_id}/restore", response_model=Restored)
async def restore_item(item_id: PydanticObjectId) -> Restored:
    item = await _get(item_id)
    kind = item.kind
    await restore(item)
    return Restored(restored=kind)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_forever(item_id: PydanticObjectId) -> None:
    """Remove it for good, files included. This cannot be undone."""
    await purge(await _get(item_id))
