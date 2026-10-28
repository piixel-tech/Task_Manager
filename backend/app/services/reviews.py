"""Review helpers: building output and picking approvers."""
from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.permissions import can
from app.models import File, Project, Subfolder, Task, TaskReview, User
from app.schemas.file import FileOut
from app.schemas.review import ReviewOut
from app.services.projects import brief, load_users, unique


async def eligible_approvers(sub: Subfolder, task: Task) -> list[User]:
    """Active heads of the task's subfolder, other than the assignee (no approving your own work)."""
    ids = [h for h in sub.head_ids if h != task.assignee_id]
    people = await load_users(ids)
    return [p for p in people.values() if p.is_active and p.role in ("admin", "employee")]


async def review_outs(reviews: list[TaskReview], viewer: User) -> list[ReviewOut]:
    if not reviews:
        return []
    tasks = {t.id: t for t in await Task.find({"_id": {"$in": unique(r.task_id for r in reviews)}}).to_list()}
    subs = {s.id: s for s in await Subfolder.find({"_id": {"$in": unique(t.subfolder_id for t in tasks.values())}}).to_list()}
    projects = {p.id: p for p in await Project.find({"_id": {"$in": unique(t.project_id for t in tasks.values())}}).to_list()}
    people = await load_users([i for r in reviews for i in (r.submitted_by, r.approver_id, r.decided_by) if i])
    files = {f.id: f for f in await File.find({"_id": {"$in": unique(x for r in reviews for x in r.file_ids)}}).to_list()}

    out = []
    for r in reviews:
        task = tasks.get(r.task_id)
        sub = subs.get(task.subfolder_id) if task else None
        project = projects.get(task.project_id) if task else None
        out.append(
            ReviewOut(
                id=r.id,
                task_id=r.task_id,
                task_title=task.title if task else "(deleted task)",
                project_id=task.project_id if task else None,
                project_name=project.name if project else "",
                subfolder_name=sub.name if sub else "",
                round=r.round,
                submitted_by=brief(people[r.submitted_by]) if r.submitted_by in people else None,
                approver=brief(people[r.approver_id]) if r.approver_id in people else None,
                note=r.note,
                files=[FileOut.model_validate(files[f], from_attributes=True) for f in r.file_ids if f in files],
                decision=r.decision,
                comments=r.comments,
                decided_by=brief(people[r.decided_by]) if r.decided_by in people else None,
                decided_at=r.decided_at,
                created_at=r.created_at,
                can_decide=r.decision == "pending" and can(viewer, "task.review", sub, approver_id=r.approver_id),
            )
        )
    return out


async def get_review_or_404(review_id: PydanticObjectId) -> TaskReview:
    review = await TaskReview.get(review_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    return review
