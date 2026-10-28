from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_claims
from app.core.timeutil import as_utc
from app.models import Session, User

bearer = HTTPBearer(auto_error=False)

SEEN_EVERY = timedelta(minutes=1)  # how often "last seen" is written


def _unauthorized() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def user_for_token(token: str | None, expected: str = "access") -> tuple[User, dict] | None:
    """The active user a token belongs to, or None. A token tied to a sign-in (session) stops working when that
    session is revoked; older tokens without one stop working after "log out everywhere"."""
    claims = decode_claims(token, expected) if token else None
    sub = claims.get("sub") if claims else None
    if not sub or not PydanticObjectId.is_valid(sub):
        return None
    user = await User.get(PydanticObjectId(sub))
    if user is None or not user.is_active:
        return None
    sid = claims.get("sid")
    if sid:
        session = await Session.get(PydanticObjectId(sid)) if PydanticObjectId.is_valid(sid) else None
        if session is None or session.revoked or session.user_id != user.id:
            return None
        now = datetime.now(timezone.utc)
        if expected == "access" and now - as_utc(session.last_seen_at) > SEEN_EVERY:
            await Session.find({"_id": session.id}).update({"$set": {"last_seen_at": now}})
    elif user.sessions_revoked_before is not None:
        return None
    return user, claims


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    found = await user_for_token(creds.credentials if creds else None)
    if found is None:
        raise _unauthorized()
    return found[0]


def require_role(*roles: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return checker
