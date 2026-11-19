"""Settings > Email (admin only): connect the sender mailbox, send a test, read the Email log."""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import EmailLog, EmailSender, User
from app.services import email as mail

router = APIRouter(prefix="/email", tags=["email"])

STATE_MINUTES = 10


class SenderOut(BaseModel):
    address: str
    status: str
    connected_at: datetime


class EmailStatusOut(BaseModel):
    configured: bool
    setup_problem: str | None
    redirect_uri: str
    sender: SenderOut | None


class ConnectOut(BaseModel):
    auth_url: str


class LogOut(BaseModel):
    id: str
    to: str
    type: str
    subject: str
    status: str
    error: str | None
    attempts: int
    created_at: datetime
    sent_at: datetime | None


class LogPage(BaseModel):
    items: list[LogOut]
    total: int


@router.get("", response_model=EmailStatusOut)
async def get_status(user: User = Depends(get_current_user)) -> EmailStatusOut:
    require(user, "email.manage")
    problem = mail.setup_problem()
    sender = await EmailSender.find_one()
    return EmailStatusOut(
        configured=problem is None,
        setup_problem=problem,
        redirect_uri=settings.EMAIL_REDIRECT_URI,
        sender=SenderOut(address=sender.address, status=sender.status, connected_at=sender.created_at) if sender else None,
    )


@router.post("/connect", response_model=ConnectOut)
async def connect(user: User = Depends(get_current_user)) -> ConnectOut:
    """Start Google sign-in for the sender mailbox. The browser goes to the returned address and comes back through /callback."""
    require(user, "email.manage")
    problem = mail.setup_problem()
    if problem:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, problem)
    now = datetime.now(timezone.utc)
    state = jwt.encode(
        {"type": "email_state", "sub": str(user.id), "iat": now, "exp": now + timedelta(minutes=STATE_MINUTES)},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    return ConnectOut(auth_url=mail.authorize_url(state))


@router.get("/callback", include_in_schema=False)
async def callback(code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    """Where Google sends the browser back. No bearer token here: the signed `state` we issued says who it is."""
    user: User | None = None
    try:
        claims = jwt.decode(state or "", settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if claims.get("type") == "email_state":
            user = await User.get(claims["sub"])
    except (jwt.PyJWTError, ValueError):
        pass

    def back(result: str, message: str = "") -> RedirectResponse:
        q = {"result": result, **({"message": message[:200]} if message else {})}
        return RedirectResponse(f"{settings.FRONTEND_URL.rstrip('/')}/admin/settings/email?{urlencode(q)}", status_code=status.HTTP_303_SEE_OTHER)

    if user is None or not user.is_active or user.role != "admin":
        return back("error", "That sign-in link expired. Start again from Settings.")
    if error or not code:
        return back("denied" if error == "access_denied" else "error", "" if error == "access_denied" else (error or "No code from Google"))
    try:
        await mail.connect_with_code(code, user.id)
    except (RuntimeError, mail.EmailNotConfigured) as exc:
        return back("error", str(exc))
    return back("connected")


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(user: User = Depends(get_current_user)) -> None:
    require(user, "email.manage")
    if not await mail.disconnect():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No sender mailbox is connected")


@router.post("/test", response_model=LogOut, status_code=status.HTTP_202_ACCEPTED)
async def send_test(user: User = Depends(get_current_user)) -> LogOut:
    """Send a test email to the signed-in admin. It goes out in the background; the Email log shows how it went."""
    require(user, "email.manage")
    if await EmailSender.find_one() is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect a sender mailbox first")
    entry = await mail.send_email(
        user.email,
        "test",
        "Task Manager test email",
        heading="Email is working",
        text="This is a test email from Task Manager. If you can read this, new-task and approval emails will reach your team.",
        button_label="Open Task Manager",
        path="/admin/settings/email",
    )
    return _out(entry)


def _out(e: EmailLog) -> LogOut:
    return LogOut(id=str(e.id), to=e.to, type=e.type, subject=e.subject, status=e.status, error=e.error, attempts=e.attempts, created_at=e.created_at, sent_at=e.sent_at)


@router.get("/log", response_model=LogPage)
async def email_log(limit: int = Query(50, ge=1, le=200), skip: int = Query(0, ge=0), user: User = Depends(get_current_user)) -> LogPage:
    require(user, "email.manage")
    rows = await EmailLog.find_all().sort("-created_at").skip(skip).limit(limit).to_list()
    return LogPage(items=[_out(e) for e in rows], total=await EmailLog.find_all().count())
