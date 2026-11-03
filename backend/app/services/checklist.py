"""Helpers for checklists and deliverables."""
import uuid
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.permissions import can
from app.models import ChecklistItem, DeliverablePlan, File, Subfolder, User
from app.models.deliverable import LEGACY_STAGES, DeliverableItem, StageDef
from app.schemas.file import FileOut
from app.schemas.checklist import ChecklistFileOut, ChecklistItemOut
from app.schemas.deliverable import MAX_COUNT, MAX_TYPES, DeliverableItemOut, DeliverablesOut, TypeSummary
from app.services.projects import brief, load_users, unique
from app.services.storage import get_storage


def team_of(sub: Subfolder) -> list[PydanticObjectId]:
    return unique([*sub.head_ids, *sub.member_ids])


# --- Checklist ---------------------------------------------------------------------------------------
async def checklist_outs(items: list[ChecklistItem], sub: Subfolder, viewer: User) -> list[ChecklistItemOut]:
    files = {f.id: f for f in await File.find({"_id": {"$in": unique(a for i in items for a in i.attachment_ids)}}).to_list()}
    people = await load_users([i.created_by for i in items] + [f.owner_id for f in files.values()])
    manage = can(viewer, "deliverable.edit", sub)  # heads and admins
    out = []
    for i in items:
        attachments = []
        for a in i.attachment_ids:
            f = files.get(a)
            if f:
                attachments.append(
                    ChecklistFileOut(
                        **FileOut.model_validate(f, from_attributes=True).model_dump(), owner=brief(people[f.owner_id]) if f.owner_id in people else None
                    )
                )
        out.append(
            ChecklistItemOut(
                id=i.id,
                subfolder_id=i.subfolder_id,
                text=i.text,
                created_by=brief(people[i.created_by]) if i.created_by in people else None,
                created_at=i.created_at,
                updated_at=i.updated_at,
                attachments=attachments,
                can_edit=i.created_by == viewer.id and can(viewer, "checklist.write", sub),
                can_delete=manage or i.created_by == viewer.id,
            )
        )
    return out


async def delete_files(file_ids: list[PydanticObjectId]) -> None:
    storage = get_storage()
    for f in await File.find({"_id": {"$in": unique(file_ids)}}).to_list():
        if f.storage_key:
            await storage.delete(f.storage_key)
        await f.delete()


async def delete_subfolder_content(subfolder_ids: list[PydanticObjectId]) -> None:
    """Checklist items (with their files) and deliverable plans of subfolders that are going away."""
    if not subfolder_ids:
        return
    from app.services.activity import delete_activity  # late: activity imports this module

    await delete_activity(subfolder_ids=subfolder_ids)
    items = await ChecklistItem.find({"subfolder_id": {"$in": subfolder_ids}}).to_list()
    await delete_files([a for i in items for a in i.attachment_ids])
    await ChecklistItem.find({"subfolder_id": {"$in": subfolder_ids}}).delete()
    await DeliverablePlan.find({"subfolder_id": {"$in": subfolder_ids}}).delete()


# --- Deliverables ----------------------------------------------------------------------------------------
def stages_of(sub: Subfolder) -> list[StageDef]:
    """The subfolder's stages in order. Subfolders that never edited them keep the legacy seven."""
    return list(sub.deliverable_stages) if sub.deliverable_stages else list(LEGACY_STAGES)


def _done(items: list[DeliverableItem], keys: list[str]) -> int:
    """An item is done once it reaches the last stage."""
    return sum(1 for i in items if i.stage == keys[-1])


def _pct(items: list[DeliverableItem], keys: list[str]) -> int:
    if not items:
        return 0
    top = len(keys) - 1
    return round(100 * sum(keys.index(i.stage) if i.stage in keys else 0 for i in items) / (len(items) * top))


async def deliverables_out(sub: Subfolder, month: str, plan: DeliverablePlan | None, viewer: User) -> DeliverablesOut:
    stages = stages_of(sub)
    keys = [s.key for s in stages]
    items = sorted(plan.items if plan else [], key=lambda i: (i.type.lower(), i.number))
    people = await load_users(i.updated_by for i in items if i.updated_by)
    types: dict[str, list[DeliverableItem]] = {}
    for i in items:
        types.setdefault(i.type, []).append(i)

    def by_stage(group: list[DeliverableItem]) -> dict[str, int]:
        return {s: sum(1 for i in group if i.stage == s) for s in keys}

    return DeliverablesOut(
        subfolder_id=sub.id,
        month=month,
        stages=keys,
        stage_labels={s.key: s.label for s in stages},
        total=len(items),
        done=_done(items, keys),
        remaining=len(items) - _done(items, keys),
        progress=_pct(items, keys),
        by_stage=by_stage(items),
        types=[
            TypeSummary(
                type=t, total=len(g), by_stage=by_stage(g), done=_done(g, keys), remaining=len(g) - _done(g, keys), progress=_pct(g, keys)
            )
            for t, g in types.items()
        ],
        items=[
            DeliverableItemOut(
                id=i.id,
                type=i.type,
                number=i.number,
                title=i.title,
                stage=i.stage,
                updated_by=brief(people[i.updated_by]) if i.updated_by in people else None,
                updated_at=i.updated_at,
            )
            for i in items
        ],
        can_set_counts=can(viewer, "deliverable.edit", sub),
        can_set_stage=can(viewer, "deliverable.stage", sub),
    )


async def get_plan(sub_id: PydanticObjectId, month: str) -> DeliverablePlan | None:
    return await DeliverablePlan.find_one(DeliverablePlan.subfolder_id == sub_id, DeliverablePlan.month == month)


async def get_or_create_plan(sub_id: PydanticObjectId, month: str) -> DeliverablePlan:
    plan = await get_plan(sub_id, month)
    if plan:
        return plan
    try:
        return await DeliverablePlan(subfolder_id=sub_id, month=month).insert()
    except Exception:  # unique index: someone created it a moment ago
        plan = await get_plan(sub_id, month)
        if plan is None:
            raise
        return plan


async def apply_counts(plan: DeliverablePlan, counts: dict[str, int], user: User, first: StageDef) -> list[str]:
    """Grow or shrink each named type to the requested count. Returns a readable list of what changed.

    Growing adds the next numbers. Shrinking removes the highest numbers, but only items still in
    the first stage: work that has moved on is never deleted silently. Types not mentioned are left alone.
    """
    now = datetime.now(timezone.utc)
    existing: dict[str, list[DeliverableItem]] = {}
    for i in plan.items:
        existing.setdefault(i.type.lower(), []).append(i)

    add: list[dict] = []
    drop: list[str] = []
    changes: list[str] = []
    for name, n in counts.items():
        group = sorted(existing.get(name.lower(), []), key=lambda i: i.number)
        label = group[0].type if group else name  # keep the first spelling used
        have = len(group)
        if n > have:
            top = group[-1].number if group else 0
            for k in range(1, n - have + 1):
                add.append(
                    DeliverableItem(
                        id=uuid.uuid4().hex, type=label, number=top + k, title=f"{label} {top + k}", stage=first.key, updated_by=user.id, updated_at=now
                    ).model_dump()
                )
        elif n < have:
            doomed = group[n:]
            moved = [d.title for d in doomed if d.stage != first.key]
            if moved:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Can't remove {', '.join(moved)}: already past {first.label.lower()}. Keep the count or move it back first.",
                )
            drop.extend(d.id for d in doomed)
        if n != have:
            changes.append(f"{label}: {have} → {n}")

    if drop:
        await DeliverablePlan.find({"_id": plan.id}).update({"$pull": {"items": {"id": {"$in": drop}}}})
    if add:
        await DeliverablePlan.find({"_id": plan.id}).update({"$push": {"items": {"$each": add}}})
    return changes


async def add_items(plan: DeliverablePlan, type_name: str, count: int, user: User, first: StageDef) -> str:
    """Append `count` items to a type (created if new), numbered after the highest existing one. Returns the type label."""
    group = [i for i in plan.items if i.type.lower() == type_name.lower()]
    label = group[0].type if group else type_name  # keep the first spelling used
    top = max((i.number for i in group), default=0)
    if len(group) + count > MAX_COUNT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"At most {MAX_COUNT} items per type")
    if not group and len({i.type.lower() for i in plan.items}) >= MAX_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"At most {MAX_TYPES} types")
    now = datetime.now(timezone.utc)
    new = [
        DeliverableItem(
            id=uuid.uuid4().hex, type=label, number=top + k, title=f"{label} {top + k}", stage=first.key, updated_by=user.id, updated_at=now
        ).model_dump()
        for k in range(1, count + 1)
    ]
    await DeliverablePlan.find({"_id": plan.id}).update({"$push": {"items": {"$each": new}}})
    return label
