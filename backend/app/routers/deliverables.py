from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.timeutil import today_local
from app.models import DeliverablePlan, Project, Subfolder, User
from app.schemas.deliverable import MONTH_RE, CountsSet, DeliverablesOut, ItemsAdd, StageSet
from app.services.checklist import add_items, apply_counts, deliverables_out, get_or_create_plan, get_plan, team_of
from app.services.projects import get_subfolder_or_404, notify_people, subfolders_of

router = APIRouter(prefix="/subfolders/{subfolder_id}/deliverables", tags=["deliverables"])

Month = Path(pattern=MONTH_RE.pattern, description="YYYY-MM")


async def _ping(sub: Subfolder, user: User, title: str, body: str) -> None:
    await notify_people(
        team_of(sub),
        type="deliverables_updated",
        title=title,
        body=body,
        project_id=sub.project_id,
        subfolder_id=sub.id,
        actor=user,
        tab="deliverables",
    )


@router.get("", response_model=DeliverablesOut)
async def get_deliverables(
    subfolder_id: PydanticObjectId,
    month: str | None = Query(None, pattern=MONTH_RE.pattern, description="YYYY-MM, default this month"),
    user: User = Depends(get_current_user),
) -> DeliverablesOut:
    """Tracker for one month: items with stages, counts per stage per type, and progress."""
    sub = await get_subfolder_or_404(subfolder_id)
    project = await Project.get(sub.project_id)
    require(user, "deliverable.view", sub, siblings=await subfolders_of(sub.project_id), project=project)
    month = month or today_local().strftime("%Y-%m")
    return await deliverables_out(sub, month, await get_plan(sub.id, month), user)


@router.put("/{month}", response_model=DeliverablesOut)
async def set_counts(
    subfolder_id: PydanticObjectId, body: CountsSet, month: str = Month, user: User = Depends(get_current_user)
) -> DeliverablesOut:
    """Heads and admins set how many of each type this month; numbered items are created (or removed) to match."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.edit", sub)
    plan = await get_or_create_plan(sub.id, month)
    changes = await apply_counts(plan, body.counts, user)
    if changes:
        await _ping(sub, user, f"Deliverables updated: {sub.name}", f"{user.name} set {month}: {'; '.join(changes)}.")
    return await deliverables_out(sub, month, await get_plan(sub.id, month), user)


@router.patch("/{month}/items/{item_id}", response_model=DeliverablesOut)
async def set_stage(
    subfolder_id: PydanticObjectId, body: StageSet, item_id: str, month: str = Month, user: User = Depends(get_current_user)
) -> DeliverablesOut:
    """Any member moves an item to any stage (forwards or back)."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.stage", sub)
    plan = await get_plan(sub.id, month)
    item = next((i for i in plan.items if i.id == item_id), None) if plan else None
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deliverable not found")
    if item.stage != body.stage:
        await DeliverablePlan.find({"_id": plan.id, "items.id": item_id}).update(
            {"$set": {"items.$.stage": body.stage, "items.$.updated_by": user.id, "items.$.updated_at": datetime.now(timezone.utc)}}
        )
        await _ping(
            sub,
            user,
            f"Deliverable moved: {item.title}",
            f"{user.name} moved {item.title} ({month}) from {item.stage.replace('_', ' ')} to {body.stage.replace('_', ' ')}.",
        )
    return await deliverables_out(sub, month, await get_plan(sub.id, month), user)


@router.post("/{month}/items", response_model=DeliverablesOut, status_code=status.HTTP_201_CREATED)
async def add_more(
    subfolder_id: PydanticObjectId, body: ItemsAdd, month: str = Month, user: User = Depends(get_current_user)
) -> DeliverablesOut:
    """Heads and admins add more items to a type (or start a new type) without restating every count."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.edit", sub)
    plan = await get_or_create_plan(sub.id, month)
    label = await add_items(plan, body.type, body.count, user)
    await _ping(sub, user, f"Deliverables updated: {sub.name}", f"{user.name} added {body.count} {label} to {month}.")
    return await deliverables_out(sub, month, await get_plan(sub.id, month), user)


@router.delete("/{month}/items/{item_id}", response_model=DeliverablesOut)
async def delete_item(
    subfolder_id: PydanticObjectId, item_id: str, month: str = Month, user: User = Depends(get_current_user)
) -> DeliverablesOut:
    """Heads and admins delete a single item, whatever stage it is in. Other items keep their numbers."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.edit", sub)
    plan = await get_plan(sub.id, month)
    item = next((i for i in plan.items if i.id == item_id), None) if plan else None
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deliverable not found")
    await DeliverablePlan.find({"_id": plan.id}).update({"$pull": {"items": {"id": item_id}}})
    await _ping(sub, user, f"Deliverable deleted: {item.title}", f"{user.name} deleted {item.title} from {month}.")
    return await deliverables_out(sub, month, await get_plan(sub.id, month), user)


@router.delete("/{month}/types", response_model=DeliverablesOut)
async def delete_type(
    subfolder_id: PydanticObjectId,
    type: str = Query(min_length=1, max_length=40, description="Type name, e.g. Reels"),
    month: str = Month,
    user: User = Depends(get_current_user),
) -> DeliverablesOut:
    """Heads and admins remove a whole type with all of its items, whatever stage they are in."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.edit", sub)
    plan = await get_plan(sub.id, month)
    doomed = [i for i in plan.items if i.type.lower() == " ".join(type.split()).lower()] if plan else []
    if not doomed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deliverable type not found")
    await DeliverablePlan.find({"_id": plan.id}).update({"$pull": {"items": {"id": {"$in": [i.id for i in doomed]}}}})
    await _ping(
        sub, user, f"Deliverables updated: {sub.name}", f"{user.name} removed {doomed[0].type} ({len(doomed)} items) from {month}."
    )
    return await deliverables_out(sub, month, await get_plan(sub.id, month), user)
