"""Thin async wrapper over the Google OAuth + Calendar v3 REST endpoints (httpx). No business logic here."""
import asyncio
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from app.core.config import settings
from app.integrations.google.credentials import GoogleCredentials

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/calendar/v3"

SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events"
SCOPE_CALENDAR_LIST = "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
SCOPES = [SCOPE_EVENTS, SCOPE_CALENDAR_LIST]

RETRY_DELAYS = (1.0, 3.0)  # for 429 / 5xx; tests set this to ()


class GoogleError(Exception):
    def __init__(self, status: int, reason: str = "", message: str = ""):
        super().__init__(f"Google {status} {reason}: {message}".strip())
        self.status = status
        self.reason = reason
        self.message = message


class InvalidGrant(GoogleError):
    """The refresh token was revoked or expired: the person has to connect again."""


class Unauthorized(GoogleError):
    """The access token was rejected (expired early or revoked)."""


class SyncTokenExpired(GoogleError):
    """410 Gone: the incremental sync token is too old, start again with a full sync."""


def authorize_url(creds: GoogleCredentials, state: str) -> str:
    return AUTH_URL + "?" + urlencode(
        {
            "client_id": creds.client_id,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",  # we need a refresh token to sync in the background
            "prompt": "consent",  # ...and Google only issues one on a consent screen
            "include_granted_scopes": "true",
            "state": state,
        }
    )


def _error(resp: httpx.Response) -> GoogleError:
    reason = message = ""
    try:
        body = resp.json()
        err = body.get("error")
        if isinstance(err, dict):
            message = err.get("message", "")
            reason = (err.get("errors") or [{}])[0].get("reason", "") or err.get("status", "")
        elif isinstance(err, str):
            reason, message = err, body.get("error_description", "")
    except ValueError:
        pass
    if resp.status_code == 410:
        return SyncTokenExpired(410, reason, message)
    if reason == "invalid_grant":
        return InvalidGrant(resp.status_code, reason, message)
    if resp.status_code == 401:
        return Unauthorized(401, reason, message)
    return GoogleError(resp.status_code, reason, message)


async def _send(method: str, url: str, **kwargs: Any) -> httpx.Response:
    delays = list(RETRY_DELAYS)
    async with httpx.AsyncClient(timeout=20) as http:
        while True:
            try:
                resp = await http.request(method, url, **kwargs)
            except httpx.TransportError as exc:
                if not delays:
                    raise GoogleError(0, "network", f"Could not reach Google ({type(exc).__name__})") from exc
                await asyncio.sleep(delays.pop(0))
                continue
            if resp.status_code in (429, 500, 502, 503, 504) and delays:
                await asyncio.sleep(delays.pop(0))
                continue
            return resp


async def _api(method: str, path: str, token: str, *, ok: tuple[int, ...] = (200,), **kwargs: Any) -> dict:
    resp = await _send(method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, **kwargs)
    if resp.status_code not in ok:
        raise _error(resp)
    return resp.json() if resp.content else {}


# --- OAuth ---------------------------------------------------------------------------------------------------------
async def exchange_code(creds: GoogleCredentials, code: str) -> dict:
    resp = await _send(
        "POST",
        TOKEN_URL,
        data={
            "code": code,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
    )
    if resp.status_code != 200:
        raise _error(resp)
    return resp.json()


async def refresh_access_token(creds: GoogleCredentials, refresh_token: str) -> dict:
    resp = await _send(
        "POST",
        TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "grant_type": "refresh_token",
        },
    )
    if resp.status_code != 200:
        raise _error(resp)
    return resp.json()


async def revoke(token: str) -> bool:
    """Best effort: a token that is already dead counts as revoked."""
    try:
        resp = await _send("POST", REVOKE_URL, data={"token": token})
    except GoogleError:
        return False
    return resp.status_code == 200


# --- Calendar ------------------------------------------------------------------------------------------------------
async def list_calendars(token: str) -> list[dict]:
    items: list[dict] = []
    page: str | None = None
    while True:
        params: dict[str, Any] = {"minAccessRole": "reader", "maxResults": 250}
        if page:
            params["pageToken"] = page
        body = await _api("GET", "/users/me/calendarList", token, params=params)
        items += body.get("items", [])
        page = body.get("nextPageToken")
        if not page:
            return items


async def list_events(token: str, calendar_id: str, *, sync_token: str | None, time_min: str | None, page_token: str | None) -> dict:
    """One page. `singleEvents` expands recurring events into their instances, so they land on the calendar like any other."""
    params: dict[str, Any] = {"singleEvents": "true", "maxResults": 250, "showDeleted": "true"}
    if sync_token:
        params["syncToken"] = sync_token  # Google forbids timeMin/timeMax together with a sync token
    elif time_min:
        params["timeMin"] = time_min
    if page_token:
        params["pageToken"] = page_token
    return await _api("GET", f"/calendars/{_q(calendar_id)}/events", token, params=params)


async def insert_event(token: str, calendar_id: str, body: dict) -> dict:
    return await _api("POST", f"/calendars/{_q(calendar_id)}/events", token, json=body)


async def update_event(token: str, calendar_id: str, event_id: str, body: dict) -> dict:
    return await _api("PUT", f"/calendars/{_q(calendar_id)}/events/{_q(event_id)}", token, json=body)


async def delete_event(token: str, calendar_id: str, event_id: str) -> None:
    resp = await _send(
        "DELETE", f"{API}/calendars/{_q(calendar_id)}/events/{_q(event_id)}", headers={"Authorization": f"Bearer {token}"}
    )
    if resp.status_code not in (200, 204, 404, 410):  # already gone is fine
        raise _error(resp)


async def watch_events(token: str, calendar_id: str, body: dict) -> dict:
    return await _api("POST", f"/calendars/{_q(calendar_id)}/events/watch", token, json=body)


async def stop_channel(token: str, channel_id: str, resource_id: str) -> None:
    resp = await _send(
        "POST",
        f"{API}/channels/stop",
        headers={"Authorization": f"Bearer {token}"},
        json={"id": channel_id, "resourceId": resource_id},
    )
    if resp.status_code not in (200, 204, 404):
        raise _error(resp)


def _q(value: str) -> str:
    return quote(value, safe="")
