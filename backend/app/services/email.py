"""Sending email through the Gmail API (HTTPS, so it works on hosts that block SMTP).

    await send_email(to, "task_assigned", "New task", heading=..., text=..., button_label="Open task", path="/app/tasks/1")

returns at once; the message is sent in the background, retried up to 3 times, and every email gets a row in the Email log.
Mail goes out from one workspace-wide mailbox that an admin connects under Settings > Email.
"""
import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr
from urllib.parse import urlencode

import httpx
from beanie import PydanticObjectId

from app.core.config import settings
from app.integrations import crypto
from app.integrations.google import client as gclient
from app.integrations.google.credentials import GoogleCredentials, _env, env_prefix
from app.models import EmailLog, EmailSender, IntegrationConnection
from app.services.email_template import render

log = logging.getLogger(__name__)

SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send"
SCOPES = [SCOPE_SEND, "openid", "email"]  # openid + email only tell us which address was connected
DISPLAY_NAME = "Task Manager"
RETRY_DELAYS = (5.0, 30.0, 120.0)  # the 3 retries after the first try; tests set this to (0, 0, 0)

_running: set[asyncio.Task] = set()


class EmailNotConfigured(Exception):
    """The Google keys for the sender app are missing. The message is safe to show to an admin."""


def oauth_credentials() -> GoogleCredentials:
    prefix = env_prefix(settings.EMAIL_OAUTH_COMPANY)
    creds = GoogleCredentials(settings.EMAIL_OAUTH_COMPANY, _env(prefix + "CLIENT_ID"), _env(prefix + "CLIENT_SECRET"), "")
    if not (creds.client_id and creds.client_secret):
        raise EmailNotConfigured(f"Set {prefix}CLIENT_ID and {prefix}CLIENT_SECRET to connect a sender mailbox")
    return creds


def setup_problem() -> str | None:
    if not crypto.key_is_valid():
        return "INTEGRATIONS_FERNET_KEY is missing or invalid"
    try:
        oauth_credentials()
    except EmailNotConfigured as exc:
        return str(exc)
    return None


# --- sending ---------------------------------------------------------------------------------------------------------
def _mime(sender: str, to: str, subject: str, html: str, plain: str) -> str:
    msg = EmailMessage()
    msg["From"] = formataddr((DISPLAY_NAME, sender))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")
    return base64.urlsafe_b64encode(msg.as_bytes()).decode()


class _Permanent(Exception):
    """No point retrying: nothing is connected, or Google revoked our access."""


async def _attempt(entry: EmailLog, html: str, plain: str) -> None:
    sender = await EmailSender.find_one()
    if sender is None:
        raise _Permanent("No sender mailbox is connected (Settings > Email)")
    if sender.status != "connected":
        raise _Permanent("The sender mailbox needs to be reconnected (Settings > Email)")
    try:
        data = await gclient.refresh_access_token(oauth_credentials(), crypto.decrypt(sender.refresh_token))
    except gclient.InvalidGrant as exc:
        sender.status = "needs_reconnect"
        await sender.save()
        raise _Permanent("Google no longer allows the sender mailbox. Reconnect it in Settings > Email") from exc
    raw = _mime(sender.address, entry.to, entry.subject, html, plain)
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.post(SEND_URL, headers={"Authorization": f"Bearer {data['access_token']}"}, json={"raw": raw})
    except httpx.TransportError as exc:
        raise RuntimeError(f"Could not reach Gmail ({type(exc).__name__})") from exc
    if resp.status_code == 200:
        return
    if resp.status_code == 400:
        raise _Permanent("Gmail rejected the message (400)")
    raise RuntimeError(f"Gmail answered {resp.status_code}")


async def _deliver(entry_id: PydanticObjectId, html: str, plain: str) -> None:
    entry = await EmailLog.get(entry_id)
    if entry is None:
        return
    delays = list(RETRY_DELAYS)
    while True:
        entry.attempts += 1
        try:
            await _attempt(entry, html, plain)
            entry.status, entry.error, entry.sent_at = "sent", None, datetime.now(timezone.utc)
            break
        except _Permanent as exc:
            entry.status, entry.error = "failed", str(exc)
            break
        except Exception as exc:  # noqa: BLE001 - whatever went wrong: retry, then record it
            entry.error = str(exc)[:300]
            if not delays:
                entry.status = "failed"
                break
            await entry.save()
            await asyncio.sleep(delays.pop(0))
    await entry.save()
    if entry.status == "failed":
        log.warning("email to %s (%s) failed: %s", entry.to, entry.type, entry.error)


async def send_email(to: str, type: str, subject: str, *, heading: str, text: str, button_label: str, path: str) -> EmailLog:
    """Queue one email and return at once. `path` is the exact page the button opens (joined to FRONTEND_URL)."""
    html, plain = render(heading, text, button_label, path)
    return await send_rendered(to, type, subject, html, plain)


async def send_rendered(to: str, type: str, subject: str, html: str, plain: str) -> EmailLog:
    """Queue a message whose HTML and plain text were already built (the daily summary has its own layout)."""
    entry = EmailLog(to=to, type=type, subject=subject)
    await entry.insert()
    task = asyncio.create_task(_deliver(entry.id, html, plain))
    _running.add(task)
    task.add_done_callback(_running.discard)
    return entry


async def send_quietly(to: str, type: str, subject: str, **kw) -> None:
    """send_email for events that already happened (a saved request, a decision): a mail problem is logged, never raised,
    so it can't undo or fail the action. The Email log shows how each one went."""
    try:
        await send_email(to, type, subject, **kw)
    except Exception:  # noqa: BLE001
        log.exception("Could not queue the %s email", type)


async def wait_for_pending() -> None:
    """For tests and shutdown: wait until every queued email has been tried."""
    while _running:
        await asyncio.gather(*list(_running), return_exceptions=True)


# --- connecting the mailbox ------------------------------------------------------------------------------------------
def authorize_url(state: str) -> str:
    creds = oauth_credentials()
    return gclient.AUTH_URL + "?" + urlencode(
        {
            "client_id": creds.client_id,
            "redirect_uri": settings.EMAIL_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",  # Google only issues a refresh token on a consent screen
            "state": state,
        }
    )


def _id_token_email(id_token: str) -> str:
    """The address from Google's id_token. It came straight from Google's token endpoint over TLS, so it is not re-verified."""
    try:
        part = id_token.split(".")[1]
        return str(json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))).get("email", ""))
    except (IndexError, ValueError):
        return ""


async def connect_with_code(code: str, user_id: PydanticObjectId) -> EmailSender:
    """Finish the sign-in. Raises RuntimeError with a message that is safe to show."""
    creds = oauth_credentials()
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.post(
                gclient.TOKEN_URL,
                data={"code": code, "client_id": creds.client_id, "client_secret": creds.client_secret, "redirect_uri": settings.EMAIL_REDIRECT_URI, "grant_type": "authorization_code"},
            )
    except httpx.TransportError as exc:
        raise RuntimeError("Could not reach Google. Try again.") from exc
    if resp.status_code != 200:
        raise RuntimeError("Google did not accept the sign-in. Try again.")
    data = resp.json()
    if SCOPE_SEND not in (data.get("scope") or "").split():
        raise RuntimeError("Permission to send email was not given. Tick it on Google's screen and try again.")
    if not data.get("refresh_token"):
        raise RuntimeError("Google did not return a long-lived token. Remove Task Manager from your Google account's connected apps and try again.")
    address = _id_token_email(data.get("id_token", ""))
    if not address:
        raise RuntimeError("Could not tell which mailbox was connected.")
    await EmailSender.find_all().delete()  # there is only ever one sender
    sender = EmailSender(address=address, refresh_token=crypto.encrypt(data["refresh_token"]), connected_by=user_id)
    await sender.insert()
    return sender


async def disconnect() -> bool:
    sender = await EmailSender.find_one()
    if sender is None:
        return False
    # Google revokes the whole grant of a person + app, so revoking the sender's token would also kill the Calendar login of the
    # same Google account. In that case just forget our copy.
    shares_calendar = await IntegrationConnection.find_one(IntegrationConnection.provider == "google", IntegrationConnection.account == sender.address)
    if shares_calendar is None:
        try:
            await gclient.revoke(crypto.decrypt(sender.refresh_token))
        except Exception:  # noqa: BLE001 - revoking is best effort; the token is forgotten either way
            pass
    await sender.delete()
    return True
