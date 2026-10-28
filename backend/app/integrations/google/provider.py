"""Google Calendar: OAuth, two-way sync, and push-notification channels.

Pull  Google -> Task Manager: events of the calendars the person ticked are copied into `external_events` (recurring events
      arrive as their individual instances). After the first full sync only changes are fetched (Google `syncToken`).
Push  Task Manager -> Google: the person's bookings and the due dates of their open tasks become events. Each event has a
      deterministic id (`tmb<booking id>` / `tmt<task id>`), so retries can never create duplicates, and a fingerprint of what
      was last sent means unchanged items cost no API call.
"""
import hashlib
import hmac
import json
import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Awaitable, Callable

from beanie import PydanticObjectId

from app.core.config import settings
from app.core.timeutil import as_utc, today_local, tz
from app.integrations import crypto
from app.integrations.base import IntegrationError, Provider, SyncResult
from app.integrations.google import client, credentials
from app.models import Booking, ExternalEvent, IntegrationConnection, IntegrationLink, Task, User

log = logging.getLogger(__name__)

TM_TAG = "task-manager"  # marks events we created so they are never pulled back in as "Google" events
FIRST_SYNC_LOOKBACK = timedelta(days=30)
RENEW_BEFORE = timedelta(hours=24)
CHANNEL_TTL_SECONDS = 6 * 24 * 3600


def channel_token(channel_id: str) -> str:
    """Google echoes this back on every webhook call; it proves the call is for a channel we created."""
    return hmac.new(settings.JWT_SECRET.encode(), f"google-channel:{channel_id}".encode(), hashlib.sha256).hexdigest()


def _translate(exc: client.GoogleError) -> IntegrationError:
    if isinstance(exc, client.InvalidGrant):
        return IntegrationError("Google access was revoked or has expired.", reconnect=True)
    if isinstance(exc, client.Unauthorized):
        return IntegrationError("Google rejected the saved login.", reconnect=True)
    if exc.status == 403 and exc.reason in ("insufficientPermissions", "forbidden"):
        return IntegrationError("Google Calendar access was not granted for this action.", reconnect=True)
    if exc.status == 0:
        return IntegrationError(exc.message or "Could not reach Google.")
    return IntegrationError(f"Google Calendar returned an error ({exc.status}{' ' + exc.reason if exc.reason else ''}).")


class _Auth:
    """Keeps a connection's access token fresh and retries a call once if Google says the token is bad."""

    def __init__(self, conn: IntegrationConnection, creds: credentials.GoogleCredentials):
        self.conn = conn
        self.creds = creds

    def _expiring(self) -> bool:
        exp = self.conn.token_expires_at
        return not self.conn.access_token or exp is None or as_utc(exp) - timedelta(seconds=60) <= datetime.now(timezone.utc)

    async def refresh(self) -> str:
        try:
            data = await client.refresh_access_token(self.creds, crypto.decrypt(self.conn.refresh_token))
        except crypto.CryptoError as exc:
            raise IntegrationError(str(exc), reconnect=True) from exc
        except client.GoogleError as exc:
            raise _translate(exc) from exc
        self.conn.access_token = crypto.encrypt(data["access_token"])
        self.conn.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
        if data.get("refresh_token"):  # Google rarely rotates it, but may
            self.conn.refresh_token = crypto.encrypt(data["refresh_token"])
        await self.conn.save()
        return data["access_token"]

    async def token(self) -> str:
        if self._expiring():
            return await self.refresh()
        try:
            return crypto.decrypt(self.conn.access_token)
        except crypto.CryptoError as exc:
            raise IntegrationError(str(exc), reconnect=True) from exc

    async def call(self, fn: Callable[..., Awaitable[Any]], *args: Any, **kwargs: Any) -> Any:
        try:
            return await fn(await self.token(), *args, **kwargs)
        except client.Unauthorized:
            return await fn(await self.refresh(), *args, **kwargs)


def _local_midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz()).astimezone(timezone.utc)


def _parse_when(item: dict) -> tuple[datetime, datetime, bool] | None:
    start, end = item.get("start") or {}, item.get("end") or {}
    try:
        if "date" in start:  # all-day: dates in the person's own time zone
            s = _local_midnight(date.fromisoformat(start["date"]))
            e = _local_midnight(date.fromisoformat(end.get("date", start["date"]))) if end.get("date") else s + timedelta(days=1)
            return s, max(e, s + timedelta(days=1)), True
        s = as_utc(datetime.fromisoformat(start["dateTime"]))
        e = as_utc(datetime.fromisoformat(end["dateTime"])) if end.get("dateTime") else s + timedelta(hours=1)
        return s, e, False
    except (KeyError, ValueError):
        return None


class GoogleCalendarProvider(Provider):
    key = "google"
    name = "Google Calendar"
    description = "Show your Google events in Task Manager and put your bookings and task due dates on Google Calendar."

    # --- Setup ----------------------------------------------------------------------------------------------------
    async def setup_problem(self, user: User) -> str | None:
        if not crypto.key_is_valid():
            return "Connected apps aren't set up on this server yet (INTEGRATIONS_FERNET_KEY is missing)."
        try:
            await credentials.for_user(user)
        except credentials.NotConfigured as exc:
            return str(exc)
        return None

    async def client_config(self, user: User) -> dict:
        """The client ID and API key of the person's own company, for the browser. The client secret never leaves the server."""
        try:
            creds = await credentials.for_user(user)
        except credentials.NotConfigured as exc:
            return {"configured": False, "company": None, "client_id": None, "api_key": None, "message": str(exc)}
        return {"configured": True, "company": creds.company, "client_id": creds.client_id, "api_key": creds.api_key, "message": None}

    def push_available(self) -> bool:
        return settings.GOOGLE_PUSH_ENABLED and settings.PUBLIC_BASE_URL.lower().startswith("https://")

    def public_extras(self) -> dict:
        return {"push_available": self.push_available()}

    async def authorize_url(self, user: User, state: str) -> str:
        try:
            return client.authorize_url(await credentials.for_user(user), state)
        except credentials.NotConfigured as exc:
            raise IntegrationError(str(exc)) from exc

    async def complete_connect(self, user: User, code: str, granted_scope: str | None) -> IntegrationConnection:
        try:
            creds = await credentials.for_user(user)
            tokens = await client.exchange_code(creds, code)
            granted = set((granted_scope or tokens.get("scope") or "").split())
            if not set(client.SCOPES) <= granted:  # Google lets people untick permissions on the consent screen
                if tokens.get("access_token"):
                    await client.revoke(tokens.get("refresh_token") or tokens["access_token"])
                raise IntegrationError("Allow Task Manager to see and edit your calendar events, then try again.")
            existing = await IntegrationConnection.find_one(
                IntegrationConnection.user_id == user.id, IntegrationConnection.provider == self.key
            )
            refresh = tokens.get("refresh_token")
            # An old refresh token belongs to the old company's Google app and is useless with another one.
            if not refresh and existing and existing.config.get("company") == creds.company:
                refresh = crypto.decrypt(existing.refresh_token)
            if not refresh:
                raise IntegrationError("Google did not allow background access. Remove Task Manager at myaccount.google.com/permissions and connect again.")
            access = tokens["access_token"]
            calendars = await client.list_calendars(access)
        except client.GoogleError as exc:
            raise _translate(exc) from exc
        except (crypto.CryptoError, credentials.NotConfigured) as exc:
            raise IntegrationError(str(exc)) from exc

        conn = existing or IntegrationConnection(user_id=user.id, provider=self.key)
        conn.status = "connected"
        conn.access_token = crypto.encrypt(access)
        conn.refresh_token = crypto.encrypt(refresh)
        conn.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))
        conn.scopes = sorted(granted)
        conn.last_error = None
        conn.last_error_at = None
        conn.error_notified = False
        conn.config = self._merge_calendars(conn.config, calendars, first_time=existing is None)
        conn.config["company"] = creds.company  # refreshing later must use this company's keys, whoever the user works for then
        conn.account = next((c["id"] for c in calendars if c.get("primary")), conn.account)
        await conn.save()
        return conn

    # --- What the UI sees / changes ---------------------------------------------------------------------------------
    def public_config(self, connection: IntegrationConnection) -> dict:
        cals = connection.config.get("calendars", [])
        return {
            "calendars": [
                {
                    "id": c["id"],
                    "name": c.get("summary") or c["id"],
                    "color": c.get("color"),
                    "primary": bool(c.get("primary")),
                    "writable": c.get("access_role") in ("owner", "writer"),
                    "selected": bool(c.get("selected")),
                }
                for c in cals
            ],
            "write_calendar": connection.config.get("write_calendar"),
            "push_active": any(c.get("channel") for c in cals),
            "push_error": connection.config.get("push_error"),
        }

    async def update_config(self, connection: IntegrationConnection, data: dict) -> None:
        cals = connection.config.get("calendars", [])
        known = {c["id"]: c for c in cals}
        if "selected" in data:
            wanted = list(dict.fromkeys(data["selected"]))
            unknown = [i for i in wanted if i not in known]
            if unknown:
                raise IntegrationError("One of those calendars is not on your Google account.")
            for cal in cals:
                now_on = cal["id"] in wanted
                if cal.get("selected") and not now_on:
                    await self._forget_calendar(connection, cal)
                if now_on and not cal.get("selected"):
                    cal["sync_token"] = None  # first time on: fetch everything
                cal["selected"] = now_on
        if data.get("write_calendar"):
            target = known.get(data["write_calendar"])
            if target is None or target.get("access_role") not in ("owner", "writer"):
                raise IntegrationError("You can't add events to that calendar.")
            connection.config["write_calendar"] = target["id"]
        await connection.save()

    async def _forget_calendar(self, conn: IntegrationConnection, cal: dict) -> None:
        """Stop syncing a calendar: drop its events, its sync token and its push channel."""
        await ExternalEvent.find(
            ExternalEvent.user_id == conn.user_id, ExternalEvent.provider == self.key, ExternalEvent.calendar_id == cal["id"]
        ).delete()
        cal["sync_token"] = None
        await self._stop_channel(conn, cal)

    @staticmethod
    def _merge_calendars(config: dict, remote: list[dict], first_time: bool) -> dict:
        """Keep the person's choices and sync state; add new calendars (unticked), drop ones that are gone."""
        old = {c["id"]: c for c in config.get("calendars", [])}
        merged = []
        for r in remote:
            prev = old.get(r["id"], {})
            merged.append(
                {
                    "id": r["id"],
                    "summary": r.get("summaryOverride") or r.get("summary") or r["id"],
                    "color": r.get("backgroundColor"),
                    "primary": bool(r.get("primary")),
                    "access_role": r.get("accessRole", "reader"),
                    "selected": prev.get("selected", bool(first_time and r.get("primary"))),
                    "sync_token": prev.get("sync_token"),
                    "channel": prev.get("channel"),
                }
            )
        config = dict(config)
        config["calendars"] = merged
        write = config.get("write_calendar")
        if not write or write not in {c["id"] for c in merged if c["access_role"] in ("owner", "writer")}:
            config["write_calendar"] = next((c["id"] for c in merged if c["primary"]), None)
        return config

    # --- Sync -------------------------------------------------------------------------------------------------------
    async def sync(self, connection: IntegrationConnection) -> SyncResult:
        auth = await self._auth(connection)
        result = SyncResult()
        try:
            remote = await auth.call(client.list_calendars)
            connection.config = self._merge_calendars(connection.config, remote, first_time=False)
            await connection.save()
            for cal in connection.config["calendars"]:
                if cal.get("selected"):
                    result.pulled += await self._pull_calendar(connection, auth, cal)
                    await connection.save()  # keep the new sync token even if a later calendar fails
            await self._maintain_channels(connection, auth)
            await connection.save()
            result.pushed = await self._push(connection, auth)
        except client.GoogleError as exc:
            raise _translate(exc) from exc
        return result

    async def _pull_calendar(self, conn: IntegrationConnection, auth: _Auth, cal: dict) -> int:
        try:
            return await self._pull_pages(conn, auth, cal, full=not cal.get("sync_token"))
        except client.SyncTokenExpired:
            cal["sync_token"] = None
            return await self._pull_pages(conn, auth, cal, full=True)

    async def _pull_pages(self, conn: IntegrationConnection, auth: _Auth, cal: dict, full: bool) -> int:
        time_min = (datetime.now(timezone.utc) - FIRST_SYNC_LOOKBACK).strftime("%Y-%m-%dT%H:%M:%SZ") if full else None
        sync_token = None if full else cal["sync_token"]
        seen: set[str] = set()
        changed, page = 0, None
        while True:
            body = await auth.call(
                client.list_events, cal["id"], sync_token=sync_token, time_min=time_min, page_token=page
            )
            for item in body.get("items", []):
                changed += await self._apply_event(conn.user_id, cal["id"], item, seen)
            page = body.get("nextPageToken")
            if not page:
                break
        if full:  # a full sync is the whole truth: anything we hold that Google no longer lists is gone
            stale = await ExternalEvent.find(
                ExternalEvent.user_id == conn.user_id,
                ExternalEvent.provider == self.key,
                ExternalEvent.calendar_id == cal["id"],
            ).to_list()
            for row in stale:
                if row.external_id not in seen:
                    await row.delete()
                    changed += 1
        cal["sync_token"] = body.get("nextSyncToken") or cal.get("sync_token")
        return changed

    async def _apply_event(self, user_id: PydanticObjectId, calendar_id: str, item: dict, seen: set[str]) -> int:
        ext_id = item.get("id")
        if not ext_id:
            return 0
        key = [
            ExternalEvent.user_id == user_id,
            ExternalEvent.provider == self.key,
            ExternalEvent.calendar_id == calendar_id,
            ExternalEvent.external_id == ext_id,
        ]
        existing = await ExternalEvent.find_one(*key)
        private = (item.get("extendedProperties") or {}).get("private") or {}
        when = _parse_when(item)
        if item.get("status") == "cancelled" or private.get("tm_source") == TM_TAG or when is None:
            if existing:
                await existing.delete()
                return 1
            return 0
        seen.add(ext_id)
        start, end, all_day = when
        declined = any(a.get("self") and a.get("responseStatus") == "declined" for a in item.get("attendees") or [])
        fields = {
            "title": item.get("summary") or "(No title)",
            "location": item.get("location") or "",
            "start": start,
            "end": end,
            "all_day": all_day,
            "busy": item.get("transparency", "opaque") != "transparent" and not declined,
            "html_link": item.get("htmlLink") or "",
        }
        if existing is None:
            await ExternalEvent(user_id=user_id, provider=self.key, calendar_id=calendar_id, external_id=ext_id, **fields).insert()
            return 1
        before = {k: (as_utc(getattr(existing, k)) if k in ("start", "end") else getattr(existing, k)) for k in fields}
        if before == fields:
            return 0
        for k, v in fields.items():
            setattr(existing, k, v)
        await existing.save()
        return 1

    # --- Push notification channels --------------------------------------------------------------------------------
    async def _maintain_channels(self, conn: IntegrationConnection, auth: _Auth) -> None:
        """Ask Google to ping our webhook when a selected calendar changes. Polling carries on regardless."""
        active = self.push_available()
        conn.config.pop("push_error", None)
        for cal in conn.config.get("calendars", []):
            ch = cal.get("channel")
            wanted = active and cal.get("selected")
            if ch:
                expires = datetime.fromisoformat(ch["expires_at"])
                if not wanted or expires - RENEW_BEFORE <= datetime.now(timezone.utc):
                    await self._stop_channel(conn, cal)
                    ch = None
            if wanted and not ch:
                channel_id = uuid.uuid4().hex
                try:
                    res = await auth.call(
                        client.watch_events,
                        cal["id"],
                        {
                            "id": channel_id,
                            "type": "web_hook",
                            "address": settings.PUBLIC_BASE_URL.rstrip("/") + "/api/v1/integrations/google/webhook",
                            "token": channel_token(channel_id),
                            "params": {"ttl": str(CHANNEL_TTL_SECONDS)},
                        },
                    )
                except client.GoogleError as exc:
                    # Google answers an unverified webhook domain with a 401 "push.*" reason: that is a push problem, not a login one.
                    if isinstance(exc, (client.InvalidGrant, client.Unauthorized)) and not exc.reason.startswith("push."):
                        raise
                    conn.config["push_error"] = f"Google would not start push notifications ({exc.status} {exc.reason})."
                    log.warning("Could not watch %s for %s: %s", cal["id"], conn.user_id, exc)
                    continue
                expires_ms = int(res.get("expiration") or 0)
                expires = (
                    datetime.fromtimestamp(expires_ms / 1000, tz=timezone.utc)
                    if expires_ms
                    else datetime.now(timezone.utc) + timedelta(seconds=CHANNEL_TTL_SECONDS)
                )
                cal["channel"] = {"id": channel_id, "resource_id": res.get("resourceId", ""), "expires_at": expires.isoformat()}

    @staticmethod
    async def _auth(conn: IntegrationConnection) -> _Auth:
        try:
            return _Auth(conn, await credentials.for_connection(conn))
        except credentials.NotConfigured as exc:
            raise IntegrationError(str(exc)) from exc

    async def _stop_channel(self, conn: IntegrationConnection, cal: dict) -> None:
        ch = cal.pop("channel", None)
        if not ch:
            return
        try:
            await (await self._auth(conn)).call(client.stop_channel, ch["id"], ch["resource_id"])
        except (client.GoogleError, IntegrationError, crypto.CryptoError):
            pass  # it expires on its own; a stray ping just triggers a harmless sync

    # --- Push: Task Manager -> Google -------------------------------------------------------------------------------
    async def push_local_changes(self, connection: IntegrationConnection) -> int:
        try:
            return await self._push(connection, await self._auth(connection))
        except client.GoogleError as exc:
            raise _translate(exc) from exc

    async def _push(self, conn: IntegrationConnection, auth: _Auth) -> int:
        write_cal = conn.config.get("write_calendar")
        if not write_cal:
            return 0
        desired = await self._desired(conn.user_id)
        links = {
            (link.kind, link.local_id): link
            for link in await IntegrationLink.find(
                IntegrationLink.user_id == conn.user_id, IntegrationLink.provider == self.key
            ).to_list()
        }
        count = 0

        for (kind, local_id), (fingerprint, body) in desired.items():
            link = links.get((kind, local_id))
            if link and link.fingerprint == fingerprint and link.calendar_id == write_cal:
                continue
            if link and link.calendar_id != write_cal:  # they chose another calendar to write to: move the event
                await auth.call(client.delete_event, link.calendar_id, link.external_id)
                await self._write_event(auth, write_cal, body, exists=False)
            else:
                await self._write_event(auth, write_cal, body, exists=link is not None)
            if link is None:
                link = IntegrationLink(
                    user_id=conn.user_id, provider=self.key, kind=kind, local_id=local_id,
                    calendar_id=write_cal, external_id=body["id"], fingerprint=fingerprint,
                )
                await link.insert()
            else:
                link.calendar_id, link.external_id, link.fingerprint = write_cal, body["id"], fingerprint
                await link.save()
            count += 1

        gone = [(k, link) for k, link in links.items() if k not in desired]
        if gone:
            alive_bookings = {
                b.id for b in await Booking.find({"_id": {"$in": [k[1] for k, _ in gone if k[0] == "booking"]}}).to_list()
            }
            for (kind, local_id), link in gone:
                if kind == "booking" and local_id in alive_bookings:
                    continue  # a past booking: leave it on their calendar as history
                await auth.call(client.delete_event, link.calendar_id, link.external_id)
                await link.delete()
                count += 1
        return count

    @staticmethod
    async def _write_event(auth: _Auth, calendar_id: str, body: dict, exists: bool) -> None:
        """Insert or update. Either can find the other's situation (the person deleted our event in Google, or a retry already
        created it), so each falls back to the other once. The deterministic id makes both safe."""
        confirmed = {**body, "status": "confirmed"}  # also brings back an event that was deleted on Google's side
        try:
            if exists:
                await auth.call(client.update_event, calendar_id, body["id"], confirmed)
            else:
                await auth.call(client.insert_event, calendar_id, body)
        except client.GoogleError as exc:
            if exists and exc.status in (404, 410):
                await auth.call(client.insert_event, calendar_id, body)
            elif not exists and exc.status == 409:
                await auth.call(client.update_event, calendar_id, body["id"], confirmed)
            else:
                raise

    async def _desired(self, user_id: PydanticObjectId) -> dict[tuple[str, PydanticObjectId], tuple[str, dict]]:
        """Everything of theirs that belongs on Google right now: upcoming bookings, and open tasks that have a due date."""
        out: dict[tuple[str, PydanticObjectId], tuple[str, dict]] = {}

        def add(kind: str, local_id: PydanticObjectId, body: dict) -> None:
            fingerprint = hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()
            out[(kind, local_id)] = (fingerprint, body)

        since = _local_midnight(today_local())
        bookings = await Booking.find({"$or": [{"host_user_id": user_id}, {"booked_by": user_id}], "end": {"$gte": since}}).to_list()
        people = {u.id: u for u in await User.find({"_id": {"$in": list({b.host_user_id for b in bookings} | {b.booked_by for b in bookings})}}).to_list()}
        for b in bookings:
            host, booker = people.get(b.host_user_id), people.get(b.booked_by)
            hosting = b.host_user_id == user_id
            other = booker if hosting else host
            lines = [f"{'Booked by' if hosting else 'With'} {other.name if other else 'a teammate'} in Task Manager."]
            if b.note:
                lines.append(b.note)
            add(
                "booking",
                b.id,
                {
                    "id": f"tmb{b.id}",
                    "summary": b.title if hosting else f"{b.title} · {other.name if other else 'Task Manager'}",
                    "description": "\n\n".join(lines),
                    "start": {"dateTime": as_utc(b.start).isoformat()},
                    "end": {"dateTime": as_utc(b.end).isoformat()},
                    "extendedProperties": {"private": {"tm_source": TM_TAG, "tm_kind": "booking", "tm_id": str(b.id)}},
                },
            )

        tasks = await Task.find({"assignee_id": user_id, "due_date": {"$ne": None}, "status": {"$ne": "approved"}}).to_list()
        for t in tasks:
            try:
                due = date.fromisoformat(t.due_date)
            except (TypeError, ValueError):
                continue
            add(
                "task",
                t.id,
                {
                    "id": f"tmt{t.id}",
                    "summary": f"Due: {t.title}",
                    "description": f"Task Manager task · priority {t.priority} · {t.status.replace('_', ' ')}\n{settings.FRONTEND_URL.rstrip('/')}/app/tasks/{t.id}",
                    "start": {"date": due.isoformat()},
                    "end": {"date": (due + timedelta(days=1)).isoformat()},
                    "transparency": "transparent",  # a reminder, not a meeting: it must not make them look busy
                    "extendedProperties": {"private": {"tm_source": TM_TAG, "tm_kind": "task", "tm_id": str(t.id)}},
                },
            )
        return out

    # --- Disconnect -------------------------------------------------------------------------------------------------
    async def disconnect(self, connection: IntegrationConnection) -> bool:
        """Stop push channels, revoke the token at Google, and forget everything we hold. Events we already put on their
        Google calendar are left there. Returns whether Google confirmed the revocation."""
        for cal in connection.config.get("calendars", []):
            await self._stop_channel(connection, cal)
        revoked = False
        try:
            revoked = await client.revoke(crypto.decrypt(connection.refresh_token))
        except crypto.CryptoError:
            pass
        await ExternalEvent.find(ExternalEvent.user_id == connection.user_id, ExternalEvent.provider == self.key).delete()
        await IntegrationLink.find(IntegrationLink.user_id == connection.user_id, IntegrationLink.provider == self.key).delete()
        return revoked
