import uuid
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.core.timeutil import today_local
from app.models import DeliverablePlan, Project, Subfolder, User
from app.models.deliverable import StageDef
from app.schemas.deliverable import MONTH_RE, CountsSet, DeliverablesOut, ItemsAdd, StageSet, StagesSet, StagesUsage
from app.services.checklist import add_items, apply_counts, deliverables_out, get_or_create_plan, get_plan, stages_of, team_of
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


async def _usage(sub_id: PydanticObjectId) -> dict[str, int]:
    """How many items sit on each stage key, over every month of the subfolder."""
    counts: dict[str, int] = {}
    for plan in await DeliverablePlan.find(DeliverablePlan.subfolder_id == sub_id).to_list():
        for item in plan.items:
            counts[item.stage] = counts.get(item.stage, 0) + 1
    return counts


@router.get("/stages/usage", response_model=StagesUsage)
async def stages_usage(subfolder_id: PydanticObjectId, user: User = Depends(get_current_user)) -> StagesUsage:
    """Heads and admins: how many deliverables are on each stage (all months), so deleting a busy stage can be warned about first."""
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.edit", sub)
    return StagesUsage(counts=await _usage(sub.id))


@router.put("/stages", response_model=DeliverablesOut)
async def set_stages(
    subfolder_id: PydanticObjectId,
    body: StagesSet,
    month: str | None = Query(None, pattern=MONTH_RE.pattern, description="YYYY-MM of the tracker to answer with, default this month"),
    user: User = Depends(get_current_user),
) -> DeliverablesOut:
    """Heads and admins set this subfolder's stages: rename, add, delete and reorder in one go.

    Stages with a `key` are kept (a changed label is a rename, a changed position a reorder); entries without one are new; stages left
    out are deleted. Items on a deleted stage move to the nearest stage before it that still exists (or the first one), but only once
    the caller confirms with `move_items`: otherwise the answer is 409 `stage_in_use` listing what would move.
    """
    sub = await get_subfolder_or_404(subfolder_id)
    require(user, "deliverable.edit", sub)
    current = stages_of(sub)
    current_keys = [s.key for s in current]

    new: list[StageDef] = []
    for s in body.stages:
        if s.key is not None and (s.key not in current_keys or s.key in {n.key for n in new}):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown or repeated stage")
        new.append(StageDef(key=s.key or f"s_{uuid.uuid4().hex[:8]}", label=s.label))
    new_keys = [s.key for s in new]

    removed = [k for k in current_keys if k not in new_keys]
    usage = await _usage(sub.id)
    in_use = [(s, usage[s.key]) for s in current if s.key in removed and usage.get(s.key)]
    if in_use and not body.move_items:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "stage_in_use",
                "message": "Deliverables are on a stage you are deleting: "
                + ", ".join(f"{s.label} ({n})" for s, n in in_use),
                "stages": [{"key": s.key, "label": s.label, "count": n} for s, n in in_use],
            },
        )

    if in_use:
        now = datetime.now(timezone.utc)
        for plan in await DeliverablePlan.find(DeliverablePlan.subfolder_id == sub.id).to_list():
            touched = False
            for item in plan.items:
                if item.stage in removed:
                    at = current_keys.index(item.stage)
                    item.stage = next((current_keys[j] for j in range(at - 1, -1, -1) if current_keys[j] in new_keys), new_keys[0])
                    item.updated_by, item.updated_at = user.id, now
                    touched = True
            if touched:
                await plan.save()

    if [s.model_dump() for s in new] != [s.model_dump() for s in current]:
        await Subfolder.find_one(Subfolder.id == sub.id).update({"$set": {"deliverable_stages": [s.model_dump() for s in new]}})
        await _ping(sub, user, f"Deliverable stages changed: {sub.name}", f"{user.name} set the stages to {' → '.join(s.label for s in new)}.")

    sub = await get_subfolder_or_404(subfolder_id)
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
    changes = await apply_counts(plan, body.counts, user, stages_of(sub)[0])
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
    labels = {s.key: s.label for s in stages_of(sub)}
    if body.stage not in labels:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown stage")
    if item.stage != body.stage:
        await DeliverablePlan.find({"_id": plan.id, "items.id": item_id}).update(
            {"$set": {"items.$.stage": body.stage, "items.$.updated_by": user.id, "items.$.updated_at": datetime.now(timezone.utc)}}
        )
        await _ping(
            sub,
            user,
            f"Deliverable moved: {item.title}",
            f"{user.name} moved {item.title} ({month}) from {labels.get(item.stage, item.stage).lower()} to {labels[body.stage].lower()}.",
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
    label = await add_items(plan, body.type, body.count, user, stages_of(sub)[0])
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
