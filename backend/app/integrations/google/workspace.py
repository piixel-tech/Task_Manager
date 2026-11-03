"""Google Drive, Docs, Sheets and Meet on behalf of the signed-in person, over the same connection as Calendar.

Everything here runs inside a web request (the person just clicked something), so a problem is answered with an HTTP 409
whose `detail` is `{"code", "message", "service"}`: `not_connected`, `reconnect` (the login was revoked or expired) or
`missing_scope` (that service was never allowed). The frontend turns those into a toast with a way to fix it.

Drive access is `drive.file`: Task Manager can only open files the person picked in the Google Picker or that it created
itself. We store the link and a few facts about the file, never its content.
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.timeutil import as_utc
from app.integrations import crypto
from app.integrations.base import IntegrationError
from app.integrations.google import client, credentials
from app.integrations.google.provider import SERVICES, TM_TAG, _Auth, _translate, has_service, meet_url_of
from app.integrations.runner import record_failure
from app.models import File, IntegrationConnection, User
from app.models.file import DriveMeta

SERVICE_NAMES = {key: name for key, name, _, _ in SERVICES}
DRIVE_ID = re.compile(r"^[A-Za-z0-9_-]{8,200}$")
NEW_FILE_TYPES = {
    "document": ("application/vnd.google-apps.document", "Untitled document"),
    "spreadsheet": ("application/vnd.google-apps.spreadsheet", "Untitled spreadsheet"),
}
MEET_MINUTES = 60


def _problem(code: str, message: str, service: str, http: int = status.HTTP_409_CONFLICT) -> HTTPException:
    return HTTPException(http, detail={"code": code, "message": message, "service": service})


async def _open(user: User, service: str) -> tuple[_Auth, IntegrationConnection]:
    conn = await IntegrationConnection.find_one(IntegrationConnection.user_id == user.id, IntegrationConnection.provider == "google")
    name = SERVICE_NAMES[service]
    if conn is None:
        raise _problem("not_connected", f"Connect Google in Settings > Connected apps to use {name}.", service)
    if conn.status != "connected":
        raise _problem("reconnect", "Your Google connection stopped working. Reconnect it in Settings > Connected apps.", service)
    if not has_service(conn.scopes, service):
        raise _problem("missing_scope", f"{name} isn't allowed yet. Switch it on in Settings > Connected apps.", service)
    try:
        return _Auth(conn, await credentials.for_connection(conn)), conn
    except credentials.NotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


async def _call(user: User, service: str, work: Callable[[_Auth, IntegrationConnection], Awaitable[Any]]) -> Any:
    """Run `work` with a fresh token. A dead login is recorded on the connection (so Settings shows Reconnect, and the person
    is told once) and reported as `reconnect`; anything else becomes a readable error."""
    auth, conn = await _open(user, service)
    name = SERVICE_NAMES[service]
    try:
        try:
            return await work(auth, conn)
        except client.GoogleError as exc:
            if service in ("drive", "docs_sheets"):
                drive_error = _drive_error(exc)
                if drive_error:
                    raise drive_error from exc
            raise _translate(exc, f"Google {name}") from exc
    except (IntegrationError, crypto.CryptoError) as exc:
        err = exc if isinstance(exc, IntegrationError) else IntegrationError(str(exc), reconnect=True)
        if err.reconnect:
            await record_failure(conn.id, "Google", err)
            raise _problem("reconnect", f"{err.message} Reconnect it in Settings > Connected apps.", service) from exc
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, err.message) from exc


def _drive_error(exc: client.GoogleError) -> HTTPException | None:
    """drive.file answers 404 for a file the app was never given, so 404 here means "pick it again" as much as "deleted"."""
    if exc.status == 404:
        return HTTPException(status.HTTP_404_NOT_FOUND, "Task Manager can't open that file. Pick it again with Add from Drive, or check it still exists.")
    if exc.status == 403 and exc.reason in ("appNotAuthorizedToFile", "insufficientFilePermissions", "fileNotDownloadable"):
        return HTTPException(status.HTTP_403_FORBIDDEN, "Your Google account can't use that file from Task Manager.")
    if exc.status in (403, 429) and "ratelimit" in exc.reason.lower():
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Google is busy right now. Try again in a minute.")
    return None


def kind_of(mime: str) -> str:
    return {
        "application/vnd.google-apps.document": "document",
        "application/vnd.google-apps.spreadsheet": "spreadsheet",
        "application/vnd.google-apps.presentation": "presentation",
        "application/vnd.google-apps.folder": "folder",
        "application/pdf": "pdf",
    }.get(mime) or ("image" if mime.startswith("image/") else "video" if mime.startswith("video/") else "other")


async def _store(user: User, meta: dict) -> File:
    """Remember a Drive file as an ordinary link (so every screen that shows links already works) plus its Drive facts."""
    link = meta.get("webViewLink") or f"https://drive.google.com/file/d/{meta['id']}/view"
    modified = meta.get("modifiedTime")
    record = File(
        owner_id=user.id,
        name=(meta.get("name") or "Untitled")[:200],
        mime="text/uri-list",
        size=int(meta.get("size") or 0),
        kind="link",
        url=link,
        drive=DriveMeta(
            file_id=meta["id"],
            mime=meta.get("mimeType") or "",
            kind=kind_of(meta.get("mimeType") or ""),
            icon_url=meta.get("iconLink"),
            modified_at=as_utc(datetime.fromisoformat(modified.replace("Z", "+00:00"))) if modified else None,
        ),
    )
    await record.insert()
    return record


# --- What the routes call ----------------------------------------------------------------------------------------------
FOLDER = "application/vnd.google-apps.folder"
BROWSE_TYPES = {
    "document": "application/vnd.google-apps.document",
    "spreadsheet": "application/vnd.google-apps.spreadsheet",
}


def _quote(text: str) -> str:
    """A string for Drive's query language."""
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def browse_query(view: str, parent: str | None, search: str, kind: str) -> tuple[str, str]:
    """(q, orderBy) for one screen of the file browser. Folders are always listed (so people can open them), except under
    Recent; `kind` narrows the files to Docs or Sheets."""
    want = BROWSE_TYPES.get(kind)
    parts = ["trashed = false"]
    if view == "recent":
        parts.append(f"mimeType != {_quote(FOLDER)}")
        if want:
            parts.append(f"mimeType = {_quote(want)}")
    elif want:
        parts.append(f"(mimeType = {_quote(FOLDER)} or mimeType = {_quote(want)})")
    if search:
        parts.append(f"name contains {_quote(search)}")  # a search looks through the whole view, not just one folder
    elif parent:
        parts.append(f"{_quote(parent)} in parents")
    elif view == "my":
        parts.append("'root' in parents")
    if view == "shared" and not parent:
        parts.append("sharedWithMe = true")
    if view == "starred":
        parts.append("starred = true")
    order = {"recent": "recency desc", "starred": "folder,name_natural"}.get(view, "folder,name_natural")
    return " and ".join(parts), order


async def browse_drive(user: User, view: str, parent: str | None, search: str, kind: str, page_token: str | None) -> dict:
    """One page of the person's Drive for our own file browser (My Drive, Shared with me, Recent, Starred)."""
    if parent and parent != "root" and not DRIVE_ID.match(parent):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That doesn't look like a Drive folder")
    q, order = browse_query(view, None if parent == "root" else parent, search.strip()[:200], kind)

    async def work(auth: _Auth, conn: IntegrationConnection) -> dict:
        return await auth.call(client.list_drive_files, q=q, order_by=order, page_token=page_token)

    data = await _call(user, "drive", work)
    items = []
    for f in data.get("files", []):
        mime = f.get("mimeType") or ""
        items.append(
            {
                "id": f["id"],
                "name": f.get("name") or "Untitled",
                "mime": mime,
                "kind": kind_of(mime),
                "is_folder": mime == FOLDER,
                "icon_url": f.get("iconLink"),
                "thumbnail_url": f.get("thumbnailLink"),
                "modified_at": f.get("modifiedTime"),
                "size": int(f.get("size") or 0),
                "starred": bool(f.get("starred")),
            }
        )
    return {"items": items, "next_page_token": data.get("nextPageToken")}


async def attach_drive_file(user: User, drive_id: str) -> File:
    """Check with Google what the person picked (never trust the browser's word for a name or address), then keep the link."""
    if not DRIVE_ID.match(drive_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That doesn't look like a Drive file")

    async def work(auth: _Auth, conn: IntegrationConnection) -> dict:
        return await auth.call(client.get_drive_file, drive_id)

    meta = await _call(user, "drive", work)
    if meta.get("trashed"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That file is in the Drive trash")
    return await _store(user, meta)


async def create_drive_file(user: User, kind: str, title: str) -> File:
    """A new empty Google Doc or Sheet in the person's own Drive, linked as a file."""
    if kind not in NEW_FILE_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a Google Doc or a Google Sheet")
    mime, default = NEW_FILE_TYPES[kind]

    async def work(auth: _Auth, conn: IntegrationConnection) -> dict:
        return await auth.call(client.create_drive_file, title.strip() or default, mime)

    return await _store(user, await _call(user, "docs_sheets", work))


async def start_meet(user: User, title: str) -> str:
    """An instant Meet: a one-hour event starting now on the person's calendar, with a new Meet link. Returns the link."""

    async def work(auth: _Auth, conn: IntegrationConnection) -> str:
        now = datetime.now(timezone.utc)
        calendar = conn.config.get("write_calendar") or "primary"
        body = {
            "id": f"tmm{uuid.uuid4().hex}",
            "summary": title[:200],
            "description": "Started from Task Manager.",
            "start": {"dateTime": now.isoformat()},
            "end": {"dateTime": (now + timedelta(minutes=MEET_MINUTES)).isoformat()},
            "conferenceData": {"createRequest": {"requestId": uuid.uuid4().hex, "conferenceSolutionKey": {"type": "hangoutsMeet"}}},
            # Ours: the sync must not pull it back in as one of their "Google" events.
            "extendedProperties": {"private": {"tm_source": TM_TAG, "tm_kind": "meet"}},
        }
        event = await auth.call(client.insert_event, calendar, body, with_meet=True)
        return meet_url_of(event)

    url = await _call(user, "meet", work)
    if not url:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google didn't create a Meet link. Meet may be turned off for your Google account.")
    return url


async def drive_files_of(ids: list[PydanticObjectId]) -> list[File]:
    found = {f.id: f for f in await File.find({"_id": {"$in": ids}}).to_list()}
    return [found[i] for i in ids if i in found]
