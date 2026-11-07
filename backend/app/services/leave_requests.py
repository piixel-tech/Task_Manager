"""Leave / work-from-home requests: the rules (who may ask whom, dates, overlaps) and the notifications. Routers stay thin."""
from datetime import date, datetime, timezone
from typing import Iterable

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.timeutil import as_utc, today_local
from app.models import Company, LeaveRequest, User
from app.schemas.leave_request import LeaveRequestCreate, LeaveRequestOut
from app.services.notify import notify
from app.services.projects import brief, load_users
from app.services.ws_manager import manager

TYPE_LABEL = {"leave": "leave", "wfh": "work from home"}
DURATION_LABEL = {"full": "", "first_half": " (first half)", "second_half": " (second half)"}
ADMIN_LINK = "/admin/leave-requests"
EMPLOYEE_LINK = "/app/leave-requests"


def _nice(day: str) -> str:
    d = date.fromisoformat(day)
    return f"{d.day} {d:%b}"


def when_text(r: LeaveRequest) -> str:
    """'20 Nov', '20 Nov (first half)' or '20 Nov to 22 Nov'."""
    if r.start_date == r.end_date:
        return _nice(r.start_date) + DURATION_LABEL[r.duration]
    return f"{_nice(r.start_date)} to {_nice(r.end_date)}"


async def admins_of(company_id: PydanticObjectId | None) -> list[User]:
    """The active admins of a company: who an employee of that company can send a request to."""
    if company_id is None:
        return []
    admins = await User.find({"role": "admin", "is_active": True, "company_id": company_id}).to_list()
    return sorted(admins, key=lambda a: a.name.lower())


def _overlaps(a: LeaveRequest | LeaveRequestCreate, b: LeaveRequest) -> bool:
    if a.start_date > b.end_date or a.end_date < b.start_date:
        return False
    # the two halves of one day are different parts of the day, so they can both be asked for
    same_day = a.start_date == a.end_date == b.start_date == b.end_date
    if same_day and {a.duration, b.duration} == {"first_half", "second_half"}:
        return False
    return True


async def tell_admin(admin_id: PydanticObjectId, request_id: PydanticObjectId, state: str) -> None:
    """Live update for the admin's open screens (the badge, the dashboard card, the page): something about a request changed. Never raises."""
    try:
        await manager.send_to_users([admin_id], "leave_requests", {"id": str(request_id), "state": state})
    except Exception:  # noqa: BLE001
        pass


async def create_request(user: User, body: LeaveRequestCreate) -> LeaveRequest:
    if user.company_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Your account is not assigned to a company yet")
    if body.start_date < today_local().isoformat():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You cannot ask for a date in the past")
    if body.admin_id not in {a.id for a in await admins_of(user.company_id)}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick an admin of your company")

    open_ones = await LeaveRequest.find(
        {"user_id": user.id, "status": {"$in": ["pending", "approved"]}, "start_date": {"$lte": body.end_date}, "end_date": {"$gte": body.start_date}}
    ).to_list()
    if any(_overlaps(body, other) for other in open_ones):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a pending or approved request for these dates")

    req = LeaveRequest(
        user_id=user.id,
        company_id=user.company_id,
        type=body.type,
        start_date=body.start_date,
        end_date=body.end_date,
        duration=body.duration,
        reason=body.reason,
        admin_id=body.admin_id,
    )
    await req.insert()
    await notify(
        [req.admin_id],
        type="leave_request",
        title=f"{user.name} asked for {TYPE_LABEL[req.type]}",
        body=f"{when_text(req)}. {req.reason}",
        link=ADMIN_LINK,
        actor_id=user.id,
    )
    await tell_admin(req.admin_id, req.id, "created")
    return req


async def decide(req: LeaveRequest, admin: User, *, approve: bool, reason: str | None = None) -> LeaveRequest:
    """Approve or reject a pending request (the admin it was sent to), and tell the employee."""
    if req.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {req.status}")
    req.status = "approved" if approve else "rejected"
    req.reject_reason = None if approve else reason
    req.decided_at = datetime.now(timezone.utc)
    req.decided_by = admin.id
    # Only if it is still pending in the database: two quick clicks must not decide it twice.
    result = await LeaveRequest.find({"_id": req.id, "status": "pending"}).update(
        {"$set": {"status": req.status, "reject_reason": req.reject_reason, "decided_at": req.decided_at, "decided_by": req.decided_by}}
    )
    if not result or result.modified_count != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already decided")
    word = TYPE_LABEL[req.type]
    if approve:
        title, text = f"Your {word} request was approved", f"{admin.name} approved {when_text(req)}."
    else:
        title, text = f"Your {word} request was rejected", f"{admin.name} rejected {when_text(req)}. Reason: {reason}"
    await notify([req.user_id], type="leave_decision", title=title, body=text, link=EMPLOYEE_LINK, actor_id=admin.id)
    await tell_admin(req.admin_id, req.id, req.status)  # the admin's other open tabs
    return req


async def outs(requests: Iterable[LeaveRequest]) -> list[LeaveRequestOut]:
    """Requests as the API returns them, with the people and the company filled in."""
    requests = list(requests)
    people = await load_users([i for r in requests for i in (r.user_id, r.admin_id, r.decided_by) if i])
    companies = {c.id: c.name for c in await Company.find({"_id": {"$in": list({r.company_id for r in requests})}}).to_list()} if requests else {}
    out = []
    for r in requests:
        if r.user_id not in people or r.admin_id not in people:
            continue
        out.append(
            LeaveRequestOut(
                id=r.id,
                user=brief(people[r.user_id]),
                company_id=r.company_id,
                company_name=companies.get(r.company_id, ""),
                type=r.type,
                start_date=r.start_date,
                end_date=r.end_date,
                duration=r.duration,
                reason=r.reason,
                admin=brief(people[r.admin_id]),
                status=r.status,
                reject_reason=r.reject_reason,
                created_at=as_utc(r.created_at),
                decided_at=as_utc(r.decided_at) if r.decided_at else None,
                decided_by=brief(people[r.decided_by]) if r.decided_by in people else None,
            )
        )
    return out
