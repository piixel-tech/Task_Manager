"""Admin: who is signed in where, and signing people out."""
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.deps import require_role
from app.core.timeutil import as_utc
from app.models import Session, User
from app.schemas.project import UserBrief
from app.services.projects import brief, load_users
from app.services.ws_manager import manager

router = APIRouter(prefix="/security", tags=["security"], dependencies=[Depends(require_role("admin"))])


class SessionOut(BaseModel):
    id: PydanticObjectId
    user: UserBrief | None
    user_agent: str
    ip: str
    created_at: datetime
    last_seen_at: datetime


class LoggedOut(BaseModel):
    signed_out: int  # sign-ins that were ended


async def _tell(user_id: PydanticObjectId) -> None:
    """Their open app logs itself out straight away rather than on its next request."""
    await manager.send_to_users([user_id], "session:revoked", {})
    await manager.disconnect_user(user_id)


@router.get("/sessions", response_model=list[SessionOut])
async def sessions(user_id: PydanticObjectId | None = None, limit: int = Query(200, ge=1, le=500)) -> list[SessionOut]:
    """Current sign-ins, most recently active first."""
    query: dict = {"revoked": False}
    if user_id:
        query["user_id"] = user_id
    rows = await Session.find(query).sort("-last_seen_at").limit(limit).to_list()
    people = await load_users(r.user_id for r in rows)
    return [
        SessionOut(
            id=r.id,
            user=brief(people[r.user_id]) if r.user_id in people else None,
            user_agent=r.user_agent,
            ip=r.ip,
            created_at=as_utc(r.created_at),
            last_seen_at=as_utc(r.last_seen_at),
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", response_model=LoggedOut)
async def sign_out_one(session_id: PydanticObjectId) -> LoggedOut:
    """End one sign-in (one device)."""
    row = await Session.get(session_id)
    if row is None or row.revoked:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That sign-in is already over")
    await Session.find({"_id": row.id}).update({"$set": {"revoked": True}})
    if not await Session.find({"user_id": row.user_id, "revoked": False}).count():
        await _tell(row.user_id)
    else:
        await manager.send_to_users([row.user_id], "session:check", {})  # their devices check whether it was theirs
    return LoggedOut(signed_out=1)


@router.post("/users/{user_id}/logout", response_model=LoggedOut)
async def sign_out_everywhere(user_id: PydanticObjectId) -> LoggedOut:
    """Force logout: every device this person is signed in on, including older tokens from before sign-ins were tracked."""
    person = await User.get(user_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    result = await Session.find({"user_id": person.id, "revoked": False}).update({"$set": {"revoked": True}})
    person.sessions_revoked_before = datetime.now(timezone.utc)
    await person.save()
    await _tell(person.id)
    return LoggedOut(signed_out=result.modified_count if result else 0)
