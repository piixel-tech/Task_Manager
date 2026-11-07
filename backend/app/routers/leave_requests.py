from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import LeaveRequest, User
from app.models.leave_request import LeaveStatus
from app.schemas.leave_request import LeaveReject, LeaveRequestCreate, LeaveRequestOut
from app.schemas.project import UserBrief
from app.services.leave_requests import admins_of, create_request, decide, outs, tell_admin
from app.services.projects import brief

router = APIRouter(prefix="/leave-requests", tags=["leave-requests"])


async def _get_or_404(request_id: PydanticObjectId) -> LeaveRequest:
    req = await LeaveRequest.get(request_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return req


# --- Employee ---------------------------------------------------------------------------------------------------
@router.get("/admins", response_model=list[UserBrief])
async def admins_to_send_to(user: User = Depends(get_current_user)) -> list[UserBrief]:
    """The admins of the employee's own company: the "send to" choices."""
    require(user, "leave.request")
    return [brief(a) for a in await admins_of(user.company_id)]


@router.post("", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
async def create(body: LeaveRequestCreate, user: User = Depends(get_current_user)) -> LeaveRequestOut:
    """Ask for leave or to work from home. Dates cannot be in the past or overlap a pending or approved request. The chosen admin is told."""
    require(user, "leave.request")
    return (await outs([await create_request(user, body)]))[0]


@router.get("/mine", response_model=list[LeaveRequestOut])
async def my_requests(
    status_: LeaveStatus | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=200),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
) -> list[LeaveRequestOut]:
    """My own requests, newest first."""
    require(user, "leave.request")
    query: dict = {"user_id": user.id}
    if status_:
        query["status"] = status_
    return await outs(await LeaveRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list())


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel(request_id: PydanticObjectId, user: User = Depends(get_current_user)) -> None:
    """Cancel my own request while it is still pending."""
    require(user, "leave.request")
    req = await _get_or_404(request_id)
    if req.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")  # someone else's: do not reveal it exists
    # Only while still pending in the database, so it cannot disappear from under an admin who just decided it.
    result = await LeaveRequest.find({"_id": req.id, "status": "pending"}).delete()
    if not result or result.deleted_count != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a pending request can be cancelled")
    await tell_admin(req.admin_id, req.id, "cancelled")  # it leaves the admin's Pending list at once


# --- Admin ------------------------------------------------------------------------------------------------------
@router.get("", response_model=list[LeaveRequestOut])
async def sent_to_me(
    status_: LeaveStatus | None = Query(None, alias="status"),
    company_id: PydanticObjectId | None = None,
    limit: int = Query(100, ge=1, le=200),
    skip: int = Query(0, ge=0),
    admin: User = Depends(get_current_user),
) -> list[LeaveRequestOut]:
    """Admin: the requests sent to me, newest first. Filter by status and company."""
    require(admin, "leave.review")
    query: dict = {"admin_id": admin.id}
    if status_:
        query["status"] = status_
    if company_id:
        query["company_id"] = company_id
    return await outs(await LeaveRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list())


async def _mine_to_decide(request_id: PydanticObjectId, admin: User) -> LeaveRequest:
    require(admin, "leave.review")
    req = await _get_or_404(request_id)
    if req.admin_id != admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This request was sent to another admin")
    return req


@router.post("/{request_id}/approve", response_model=LeaveRequestOut)
async def approve(request_id: PydanticObjectId, admin: User = Depends(get_current_user)) -> LeaveRequestOut:
    """Admin: approve a pending request sent to me. The employee is told."""
    req = await decide(await _mine_to_decide(request_id, admin), admin, approve=True)
    return (await outs([req]))[0]


@router.post("/{request_id}/reject", response_model=LeaveRequestOut)
async def reject(request_id: PydanticObjectId, body: LeaveReject, admin: User = Depends(get_current_user)) -> LeaveRequestOut:
    """Admin: reject a pending request sent to me; a reason is required. The employee is told, with the reason."""
    req = await decide(await _mine_to_decide(request_id, admin), admin, approve=False, reason=body.reason)
    return (await outs([req]))[0]
