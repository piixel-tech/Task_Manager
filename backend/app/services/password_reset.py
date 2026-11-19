"""Forgot-password links, and the "your password was changed" notice.

A link is a random one-time token (only its hash is stored), valid for 30 minutes. A newer request for the same account cancels
the older link. Each address may ask 3 times an hour; the form answers the same way whatever the address, whether the limit was
hit, and whether the account exists, so it cannot be used to find out who has one.
Only admins and employees can reset by email: clients sign in through their invitation.
"""
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from app.core.security import hash_password, verify_password
from app.core.timeutil import as_utc
from app.models import PasswordReset, ResetAttempt, Session, User
from app.services import email as mail

log = logging.getLogger(__name__)

LINK_MINUTES = 30
MAX_REQUESTS_PER_HOUR = 3
RESETTABLE_ROLES = ("admin", "employee")
GENERIC_MESSAGE = "If an account exists for that email, we've sent a link to reset the password. It works for 30 minutes."
GONE_MESSAGE = "This link has expired or was already used."


def rule_problems(password: str) -> list[str]:
    """What a new password is missing. The reset page shows these live; the server enforces the same ones."""
    problems = []
    if len(password) < 8:
        problems.append("at least 8 characters")
    if len(password) > 200:
        problems.append("at most 200 characters")
    if not re.search(r"[A-Za-z]", password):
        problems.append("a letter")
    if not re.search(r"\d", password):
        problems.append("a number")
    return problems


def can_reset(user: User | None) -> bool:
    return user is not None and user.is_active and user.role in RESETTABLE_ROLES


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def issue_link(user: User) -> str:
    """A fresh link for this person; any link they had before stops working. Returns the raw token (only ever emailed)."""
    now = datetime.now(timezone.utc)
    await PasswordReset.find({"user_id": user.id, "used_at": None, "cancelled": False}).update({"$set": {"cancelled": True}})
    token = secrets.token_urlsafe(32)
    await PasswordReset(user_id=user.id, token_hash=_hash(token), expires_at=now + timedelta(minutes=LINK_MINUTES)).insert()
    return token


async def send_link(user: User, *, by_admin: bool = False) -> None:
    token = await issue_link(user)
    intro = "An administrator sent you a link to choose a new password." if by_admin else "We got a request to reset your Task Manager password."
    await mail.send_email(
        user.email,
        "password_reset",
        "Reset your Task Manager password",
        heading="Reset your password",
        text=f"{intro}\nThe link works once and expires in {LINK_MINUTES} minutes. If you didn't ask for it, ignore this email: your password stays as it is.",
        button_label="Reset password",
        path=f"/reset-password/{token}",
    )


async def request_by_email(email: str) -> None:
    """The public form. Never says anything about the address: the caller answers GENERIC_MESSAGE in every case."""
    try:
        email = email.strip().lower()
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        recent = await ResetAttempt.find({"email": email, "created_at": {"$gt": since}}).count()
        await ResetAttempt(email=email).insert()
        if recent >= MAX_REQUESTS_PER_HOUR:
            log.info("Password reset limit reached for an address; nothing sent")
            return
        user = await User.find_one(User.email == email)
        if can_reset(user):
            await send_link(user)
    except Exception:  # noqa: BLE001 - runs after the response was sent; there is nobody to tell, so log it
        log.exception("Sending a password reset link failed")


async def check(token: str) -> tuple[PasswordReset | None, str | None]:
    """(the link, None) when it can be used, else (None, "invalid" | "used" | "expired")."""
    row = await PasswordReset.find_one({"token_hash": _hash(token)}) if token else None
    if row is None:
        return None, "invalid"
    if row.used_at is not None or row.cancelled:
        return None, "used"
    if as_utc(row.expires_at) <= datetime.now(timezone.utc):
        return None, "expired"
    return row, None


async def revoke_all_sessions(user: User) -> None:
    """Sign the person out everywhere (every device with a sign-in record, and any older token without one).
    The caller saves `user`."""
    await Session.find({"user_id": user.id, "revoked": False}).update({"$set": {"revoked": True}})
    user.sessions_revoked_before = datetime.now(timezone.utc)


class ResetFailed(Exception):
    """The link is not usable (reason) or the new password is not allowed (reason == "password"). `message` is safe to show."""

    def __init__(self, reason: str, message: str):
        super().__init__(message)
        self.reason, self.message = reason, message


async def complete(token: str, new_password: str) -> User:
    row, why = await check(token)
    if row is None:
        raise ResetFailed(why or "invalid", GONE_MESSAGE)
    user = await User.get(row.user_id)
    if not can_reset(user):
        raise ResetFailed("invalid", GONE_MESSAGE)
    problems = rule_problems(new_password)
    if problems:
        raise ResetFailed("password", "Your password needs " + ", ".join(problems) + ".")
    if verify_password(new_password, user.password_hash):
        raise ResetFailed("password", "Choose a password you have not used just now.")
    claimed = await PasswordReset.find({"_id": row.id, "used_at": None, "cancelled": False}).update(
        {"$set": {"used_at": datetime.now(timezone.utc)}}
    )
    if not getattr(claimed, "modified_count", 0):  # someone used it a moment ago
        raise ResetFailed("used", GONE_MESSAGE)
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    await revoke_all_sessions(user)
    await user.save()
    await send_changed_notice(user, "You reset it with a link we emailed you.")
    return user


async def send_changed_notice(user: User, how: str) -> None:
    """"Your password was changed" email: after a reset, a change in Settings, or a temporary password from an admin."""
    await PasswordReset.find({"user_id": user.id, "used_at": None, "cancelled": False}).update({"$set": {"cancelled": True}})  # a link emailed earlier must not undo this
    when = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    await mail.send_email(
        user.email,
        "password_changed",
        "Your Task Manager password was changed",
        heading="Your password was changed",
        text=f"{how}\nWhen: {when}.\nIf this wasn't you, reset your password right away or ask an admin for help.",
        button_label="Sign in",
        path="/login",
    )
