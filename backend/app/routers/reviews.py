from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.integrations.runner import schedule_push
from app.models import Subfolder, Task, TaskReview, User
from app.models.review import ReviewDecision
from app.models.task import OPEN_STATUSES
from app.schemas.project import UserBrief
from app.schemas.review import ApproveBody, ChangesBody, ReviewOut, ReviewSubmit
from app.services.activity import log_task
from app.services.projects import brief, get_subfolder_or_404, subfolders_of
from app.services.reviews import eligible_approvers, get_review_or_404, review_outs
from app.services.tasks import check_assets, get_task_or_404, notify_task, now_utc, stop_timers

router = APIRouter(tags=["reviews"])


# --- Submitting (the assignee) ------------------------------------------------------------------
@router.get("/tasks/{task_id}/approvers", response_model=list[UserBrief])
async def approvers(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[UserBrief]:
    """Who this task can be submitted to: the heads of its subfolder."""
    task = await get_task_or_404(task_id)
    sub = await get_subfolder_or_404(task.subfolder_id)
    require(user, "task.view", sub, siblings=await subfolders_of(task.project_id), target_id=task.assignee_id)
    return [brief(p) for p in await eligible_approvers(sub, task)]


@router.post("/tasks/{task_id}/submit", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
async def submit_task(task_id: PydanticObjectId, body: ReviewSubmit, user: User = Depends(get_current_user)) -> ReviewOut:
    """The assignee hands the task in for review. Also used to resubmit after changes were requested."""
    task = await get_task_or_404(task_id)
    sub = await get_subfolder_or_404(task.subfolder_id)
    require(user, "task.work", sub, target_id=task.assignee_id)
    if task.status not in OPEN_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This task is already {task.status.replace('_', ' ')}")

    if body.approver_id not in [p.id for p in await eligible_approvers(sub, task)]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a head of this subfolder as the approver")
    await check_assets(body.file_ids, user)

    # Claim the submission atomically so a double click or second tab can't create two rounds.
    claimed = await Task.find({"_id": task.id, "status": {"$in": list(OPEN_STATUSES)}}).update({"$set": {"status": "submitted"}})
    if not claimed or claimed.modified_count != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "This task was just submitted")

    await stop_timers(task_id=task.id)  # the work is handed in: the timer stops
    round_no = await TaskReview.find(TaskReview.task_id == task.id).count() + 1
    review = TaskReview(
        task_id=task.id,
        round=round_no,
        submitted_by=user.id,
        approver_id=body.approver_id,
        note=body.note,
        file_ids=list(dict.fromkeys(body.file_ids)),
    )
    await review.insert()
    await log_task(task, user, f"submitted this task for review (round {round_no})")

    again = " (resubmitted)" if round_no > 1 else ""
    await notify_task(
        [body.approver_id],
        type="review_requested",
        title=f"Review needed: {task.title}",
        body=f"{user.name} submitted this task{again} for your review.",
        task=task,
        actor=user,
        page="reviews",
    )
    return (await review_outs([review], user))[0]


@router.get("/tasks/{task_id}/reviews", response_model=list[ReviewOut])
async def task_reviews(task_id: PydanticObjectId, user: User = Depends(get_current_user)) -> list[ReviewOut]:
    """Every round of a task, oldest first: note, files, decision, comments, who and when."""
    task = await get_task_or_404(task_id)
    sub = await get_subfolder_or_404(task.subfolder_id)
    require(user, "task.view", sub, siblings=await subfolders_of(task.project_id), target_id=task.assignee_id)
    return await review_outs(await TaskReview.find(TaskReview.task_id == task.id).sort("round").to_list(), user)


# --- Inbox ------------------------------------------------------------------------------------------
@router.get("/reviews", response_model=list[ReviewOut])
async def list_reviews(
    decision: ReviewDecision | None = None,
    limit: int = Query(100, ge=1, le=300),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
) -> list[ReviewOut]:
    """Reviews waiting on you (heads), or every review (admins). Oldest pending first."""
    if user.role == "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    conditions: dict = {} if user.role == "admin" else {"approver_id": user.id}
    if decision:
        conditions["decision"] = decision
    order = "created_at" if decision == "pending" else "-created_at"
    reviews = await TaskReview.find(conditions).sort(order).skip(skip).limit(limit).to_list()
    return await review_outs(reviews, user)


@router.get("/reviews/pending-count")
async def pending_count(user: User = Depends(get_current_user)) -> dict[str, int]:
    if user.role == "client":
        return {"count": 0}
    conditions: dict = {"decision": "pending"}
    if user.role != "admin":
        conditions["approver_id"] = user.id
    return {"count": await TaskReview.find(conditions).count()}


# --- Deciding (the approver, or an admin) -------------------------------------------------------------
async def _decide(review_id: PydanticObjectId, user: User, decision: str, comments: str | None) -> tuple[TaskReview, Task]:
    review = await get_review_or_404(review_id)
    task = await get_task_or_404(review.task_id)
    sub = await Subfolder.get(task.subfolder_id)
    require(user, "task.review", sub, approver_id=review.approver_id)

    claimed = await TaskReview.find({"_id": review.id, "decision": "pending"}).update(
        {"$set": {"decision": decision, "comments": comments, "decided_by": user.id, "decided_at": now_utc()}}
    )
    if not claimed or claimed.modified_count != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "This review was already decided")
    return await get_review_or_404(review.id), task


@router.post("/reviews/{review_id}/approve", response_model=ReviewOut)
async def approve(review_id: PydanticObjectId, body: ApproveBody | None = None, user: User = Depends(get_current_user)) -> ReviewOut:
    """Approve: the task goes to 100% and is complete."""
    review, task = await _decide(review_id, user, "approved", body.comments if body else None)
    await Task.find({"_id": task.id}).update({"$set": {"status": "approved", "progress": 100}})
    await stop_timers(task_id=task.id)
    schedule_push([task.assignee_id])  # an approved task leaves their Google calendar
    await log_task(task, user, "approved the task")
    await notify_task(
        [review.submitted_by, task.assignee_id],
        type="review_approved",
        title=f"Approved: {task.title}",
        body=f"{user.name} approved your work." + (f" “{review.comments}”" if review.comments else ""),
        task=task,
        actor=user,
    )
    return (await review_outs([review], user))[0]


@router.post("/reviews/{review_id}/request-changes", response_model=ReviewOut)
async def request_changes(review_id: PydanticObjectId, body: ChangesBody, user: User = Depends(get_current_user)) -> ReviewOut:
    """Send it back with comments. The assignee fixes it and resubmits (a new round)."""
    review, task = await _decide(review_id, user, "changes_requested", body.comments)
    await Task.find({"_id": task.id}).update({"$set": {"status": "changes_requested"}})
    schedule_push([task.assignee_id])  # back on their calendar
    await log_task(task, user, "requested changes")
    await notify_task(
        [review.submitted_by, task.assignee_id],
        type="review_changes_requested",
        title=f"Changes requested: {task.title}",
        body=f"{user.name}: “{body.comments}”",
        task=task,
        actor=user,
    )
    return (await review_outs([review], user))[0]
