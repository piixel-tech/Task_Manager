from beanie import PydanticObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from app.core.deps import bearer, get_current_user, user_for_token
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.models import Session, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageOut,
    RefreshRequest,
    ResetPasswordRequest,
    ResetTokenRequest,
    ResetTokenStatus,
    TokenResponse,
)
from app.services import password_reset
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(user: User, sid: str) -> TokenResponse:
    uid = str(user.id)
    return TokenResponse(access_token=create_access_token(uid, sid), refresh_token=create_refresh_token(uid, sid))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request) -> TokenResponse:
    user = await User.find_one(User.email == body.email.lower())
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    session = await Session(
        user_id=user.id,
        user_agent=(request.headers.get("user-agent") or "")[:300],
        ip=request.client.host if request.client else "",
    ).insert()
    return _tokens(user, str(session.id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest) -> TokenResponse:
    found = await user_for_token(body.refresh_token, "refresh")
    if found is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    user, claims = found
    if claims.get("sid"):
        return _tokens(user, claims["sid"])
    uid = str(user.id)  # an older token from before sign-ins were tracked
    return TokenResponse(access_token=create_access_token(uid), refresh_token=create_refresh_token(uid))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    """End this sign-in so its tokens stop working everywhere. Already-invalid tokens are fine: the goal is reached."""
    found = await user_for_token(creds.credentials if creds else None)
    sid = found[1].get("sid") if found else None
    if sid and PydanticObjectId.is_valid(sid):
        await Session.find({"_id": PydanticObjectId(sid)}).update({"$set": {"revoked": True}})


@router.post("/forgot-password", response_model=MessageOut)
async def forgot_password(body: ForgotPasswordRequest, background: BackgroundTasks) -> MessageOut:
    """Always the same answer, instantly: it does not depend on the account existing, being allowed, or the hourly limit."""
    background.add_task(password_reset.request_by_email, body.email)
    return MessageOut(message=password_reset.GENERIC_MESSAGE)


@router.post("/reset-password/check", response_model=ResetTokenStatus)
async def check_reset_link(body: ResetTokenRequest) -> ResetTokenStatus:
    """Lets the reset page show the form, or the "expired / already used" page, before anything is typed."""
    row, why = await password_reset.check(body.token)
    return ResetTokenStatus(valid=row is not None, reason=why)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(body: ResetPasswordRequest) -> None:
    """Set a new password with a link from the email. The link works once; every device is signed out."""
    try:
        await password_reset.complete(body.token, body.new_password)
    except password_reset.ResetFailed as exc:
        code = status.HTTP_422_UNPROCESSABLE_CONTENT if exc.reason == "password" else status.HTTP_410_GONE
        raise HTTPException(code, exc.message) from exc


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
