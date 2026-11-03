"""Google Calendar integration. Only Google's HTTP endpoints are faked (respx); our API, database and sync code are real."""
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, unquote, urlparse

import httpx
import pytest
import respx

from app.core.config import settings
from app.core.timeutil import tz
from app.integrations import crypto
from app.integrations.google import client as gclient
from app.integrations.google import credentials
from app.integrations.google.provider import GoogleCalendarProvider, channel_token
from app.integrations.runner import run_integration_sync, wait_for_pushes
from app.models import Booking, Company, ExternalEvent, IntegrationConnection, IntegrationLink, Notification, Task
from tests.test_tasks import day, make_task, team  # noqa: F401  (team is a fixture)

CAL_URL = re.compile(r"https://www\.googleapis\.com/calendar/v3/calendars/(?P<cal>[^/]+)/events(?:/(?P<ev>[^/?]+))?(?:\?.*)?$")


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def soon(days: int = 2, hour: int = 8, minutes: int = 60) -> tuple[datetime, datetime]:
    start = (datetime.now(timezone.utc) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return start, start + timedelta(minutes=minutes)


def timed(eid: str, title: str, start: datetime, end: datetime, **extra) -> dict:
    return {"id": eid, "status": "confirmed", "summary": title, "start": {"dateTime": iso(start)}, "end": {"dateTime": iso(end)}, **extra}


class FakeGoogle:
    """A tiny in-memory Google: OAuth, calendar list, events (full + incremental), writes, watch channels."""

    def __init__(self, router: respx.MockRouter):
        self.calendars = [
            {"id": "alice@example.com", "summary": "Alice", "primary": True, "accessRole": "owner", "backgroundColor": "#039be5"},
            {"id": "team@group.calendar.google.com", "summary": "Team", "accessRole": "writer", "backgroundColor": "#f4511e"},
        ]
        self.events: dict[str, list[dict]] = {}  # returned by a full sync
        self.delta: dict[str, list[dict]] = {}  # returned by an incremental sync
        self.written: dict[str, dict[str, dict]] = {}  # what we inserted / updated, per calendar
        self.calls: list[tuple[str, str, dict]] = []
        self.gone_once = False
        self.token_response = {
            "access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600,
            "scope": " ".join(gclient.ALL_SCOPES),
        }
        self.refresh_error: dict | None = None
        self.watch_error = False
        self.cal_list_status = 200
        router.post("https://oauth2.googleapis.com/token").mock(side_effect=self._token)
        router.post("https://oauth2.googleapis.com/revoke").mock(side_effect=self._revoke)
        router.get("https://www.googleapis.com/calendar/v3/users/me/calendarList").mock(side_effect=self._cal_list)
        router.post(re.compile(r".*/calendars/[^/]+/events/watch$")).mock(side_effect=self._watch)
        router.post("https://www.googleapis.com/calendar/v3/channels/stop").mock(side_effect=self._stop)
        router.get(CAL_URL).mock(side_effect=self._list)
        router.post(CAL_URL).mock(side_effect=self._insert)
        router.put(CAL_URL).mock(side_effect=self._update)
        router.delete(CAL_URL).mock(side_effect=self._delete)

    def of(self, method: str, path_part: str = "") -> list[dict]:
        return [c[2] for c in self.calls if c[0] == method and path_part in c[1]]

    def _rec(self, request: httpx.Request, **extra) -> dict:
        body = {}
        if request.content and request.headers.get("content-type", "").startswith("application/json"):
            import json

            body = json.loads(request.content)
        info = {"params": dict(request.url.params), "json": body, "auth": request.headers.get("authorization"), **extra}
        self.calls.append((request.method, unquote(request.url.path), info))
        return info

    def _token(self, request):
        form = parse_qs(request.content.decode())
        self.calls.append(("POST", "/token", {"form": {k: v[0] for k, v in form.items()}}))
        if form["grant_type"][0] == "refresh_token":
            if self.refresh_error:
                return httpx.Response(400, json=self.refresh_error)
            return httpx.Response(200, json={"access_token": "access-2", "expires_in": 3600})
        return httpx.Response(200, json=self.token_response)

    def _revoke(self, request):
        self.calls.append(("POST", "/revoke", {"form": parse_qs(request.content.decode())}))
        return httpx.Response(200, json={})

    def _cal_list(self, request):
        self._rec(request)
        if self.cal_list_status != 200:
            return httpx.Response(self.cal_list_status, json={"error": {"code": self.cal_list_status, "message": "backend error"}})
        return httpx.Response(200, json={"items": self.calendars})

    def _list(self, request, **_groups):
        cal = unquote(CAL_URL.match(str(request.url)).group("cal"))
        info = self._rec(request, cal=cal)
        if "syncToken" in info["params"]:
            if self.gone_once:
                self.gone_once = False
                return httpx.Response(410, json={"error": {"code": 410, "message": "Sync token is no longer valid", "errors": [{"reason": "fullSyncRequired"}]}})
            return httpx.Response(200, json={"items": self.delta.pop(cal, []), "nextSyncToken": "tok-incremental"})
        return httpx.Response(200, json={"items": self.events.get(cal, []), "nextSyncToken": "tok-full"})

    def _insert(self, request, **_groups):
        cal = unquote(CAL_URL.match(str(request.url)).group("cal"))
        info = self._rec(request, cal=cal)
        eid = info["json"]["id"]
        if eid in self.written.get(cal, {}):
            return httpx.Response(409, json={"error": {"code": 409, "message": "exists", "errors": [{"reason": "duplicate"}]}})
        self.written.setdefault(cal, {})[eid] = info["json"]
        return httpx.Response(200, json=info["json"])

    def _update(self, request, **_groups):
        m = CAL_URL.match(str(request.url))
        cal, eid = unquote(m.group("cal")), unquote(m.group("ev"))
        info = self._rec(request, cal=cal)
        self.written.setdefault(cal, {})[eid] = info["json"]
        return httpx.Response(200, json=info["json"])

    def _delete(self, request, **_groups):
        m = CAL_URL.match(str(request.url))
        cal, eid = unquote(m.group("cal")), unquote(m.group("ev"))
        self._rec(request, cal=cal)
        if eid not in self.written.get(cal, {}):
            return httpx.Response(410, json={"error": {"code": 410, "message": "Resource has been deleted"}})
        del self.written[cal][eid]
        return httpx.Response(204)

    def _watch(self, request):
        info = self._rec(request)
        if self.watch_error:
            return httpx.Response(401, json={"error": {"code": 401, "message": "bad webhook", "errors": [{"reason": "push.webhookUrlUnauthorized"}]}})
        exp = int((datetime.now(timezone.utc) + timedelta(days=6)).timestamp() * 1000)
        return httpx.Response(200, json={"id": info["json"]["id"], "resourceId": "res-1", "expiration": str(exp)})

    def _stop(self, request):
        self._rec(request)
        return httpx.Response(204)


_real_company_name = credentials.company_name


@pytest.fixture(autouse=True)
def _default_company(monkeypatch):
    """Test users are created without a company; unless a test gives them one, they belong to 'AcmeTest' (GOOGLE_ACMETEST_* in conftest)."""

    async def company_name(user):
        return await _real_company_name(user) if user.company_id else "AcmeTest"

    monkeypatch.setattr(credentials, "company_name", company_name)


async def in_company(person, name: str):
    company = Company(name=name)
    await company.insert()
    person.user.company_id = company.id
    await person.user.save()
    return company


@pytest.fixture(autouse=True)
def _no_retry_sleep(monkeypatch):
    monkeypatch.setattr(gclient, "RETRY_DELAYS", ())


@pytest.fixture(autouse=True)
async def _let_background_work_finish():
    yield
    await wait_for_pushes()  # a push started by one test must not run into the next test's clean database


@pytest.fixture
def google():
    with respx.mock(assert_all_called=False, assert_all_mocked=True, using="httpcore") as router:
        # Our own API is called through httpx's ASGI transport, which respx leaves alone.
        yield FakeGoogle(router)


async def connect_user(person, selected: list[str] | None = None, write_calendar: str | None = None, **fields) -> IntegrationConnection:
    """Store a working connection for someone without going through the OAuth screen."""
    provider = GoogleCalendarProvider()
    cals = [
        {"id": "alice@example.com", "summary": "Alice", "primary": True, "accessRole": "owner"},
        {"id": "team@group.calendar.google.com", "summary": "Team", "accessRole": "writer"},
    ]
    config = provider._merge_calendars({}, cals, first_time=True)
    config["company"] = "AcmeTest"
    for c in config["calendars"]:
        c["selected"] = c["id"] in (selected if selected is not None else ["alice@example.com"])
    if write_calendar:
        config["write_calendar"] = write_calendar
    conn = IntegrationConnection(
        user_id=person.user.id, provider="google", account="alice@example.com",
        access_token=crypto.encrypt("access-1"), refresh_token=crypto.encrypt("refresh-1"),
        token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1), scopes=gclient.ALL_SCOPES, config=config, **fields,
    )
    await conn.insert()
    return conn


async def sync(client, person):
    r = await client.post("/integrations/google/sync", headers=person.headers)
    assert r.status_code == 200, r.text
    return r.json()


async def titles(person) -> set[str]:
    return {e.title for e in await ExternalEvent.find(ExternalEvent.user_id == person.user.id).to_list()}


# --- Encryption ------------------------------------------------------------------------------------------------------
def test_tokens_round_trip_and_are_not_plaintext():
    secret = "ya29.super-secret-token"
    cipher = crypto.encrypt(secret)
    assert secret not in cipher and crypto.decrypt(cipher) == secret


def test_a_wrong_key_cannot_read_stored_tokens(monkeypatch):
    cipher = crypto.encrypt("hello")
    monkeypatch.setattr(settings, "INTEGRATIONS_FERNET_KEY", "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=")
    with pytest.raises(crypto.CryptoError):
        crypto.decrypt(cipher)


def test_key_rotation_old_key_still_decrypts(monkeypatch):
    cipher = crypto.encrypt("hello")
    old = settings.INTEGRATIONS_FERNET_KEY
    monkeypatch.setattr(settings, "INTEGRATIONS_FERNET_KEY", "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=," + old)
    assert crypto.decrypt(cipher) == "hello"


# --- Connecting (OAuth) ----------------------------------------------------------------------------------------------
async def test_requires_login_and_staff(client, client_user):
    assert (await client.get("/integrations")).status_code == 401
    assert (await client.get("/integrations", headers=client_user.headers)).status_code == 403
    assert (await client.post("/integrations/google/connect", headers=client_user.headers)).status_code == 403


async def test_providers_list_starts_disconnected(client, alice):
    got = (await client.get("/integrations", headers=alice.headers)).json()
    assert [(p["key"], p["configured"], p["connection"]) for p in got] == [("google", True, None)]
    assert got[0]["extras"] == {"push_available": False}
    assert got[0]["name"] == "Google"


async def test_connect_builds_an_offline_consent_url(client, alice):
    r = await client.post("/integrations/google/connect", headers=alice.headers)
    assert r.status_code == 200
    url = urlparse(r.json()["auth_url"])
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert url.netloc == "accounts.google.com"
    assert q["access_type"] == "offline" and q["prompt"] == "consent" and q["response_type"] == "code"
    assert q["client_id"] == "acme-client-id.apps.googleusercontent.com" and q["redirect_uri"] == settings.GOOGLE_REDIRECT_URI
    assert set(q["scope"].split()) == set(gclient.ALL_SCOPES)
    assert q["state"]


async def test_connect_says_so_when_the_company_has_no_google_keys(client, alice):
    await in_company(alice, "Nokeys Co")
    app = (await client.get("/integrations", headers=alice.headers)).json()[0]
    assert app["configured"] is False and app["setup_problem"] == "Google not configured for Nokeys Co"
    r = await client.post("/integrations/google/connect", headers=alice.headers)
    assert r.status_code == 503 and r.json()["detail"] == "Google not configured for Nokeys Co"
    assert (await client.get("/integrations/google/client-config", headers=alice.headers)).json() == {
        "configured": False, "company": None, "client_id": None, "api_key": None, "message": "Google not configured for Nokeys Co",
    }


async def test_a_half_filled_company_is_not_configured(client, alice, monkeypatch):
    await in_company(alice, "Halfway")
    monkeypatch.setenv("GOOGLE_HALFWAY_CLIENT_ID", "id-only")
    r = await client.post("/integrations/google/connect", headers=alice.headers)
    assert r.status_code == 503 and r.json()["detail"] == "Google not configured for Halfway"


async def test_a_person_without_a_company_gets_a_clear_message(client, alice, monkeypatch):
    monkeypatch.setattr(credentials, "company_name", _real_company_name)
    app = (await client.get("/integrations", headers=alice.headers)).json()[0]
    assert app["configured"] is False and "company" in app["setup_problem"]


async def test_each_company_uses_only_its_own_keys(client, make_user, google):
    ann, ola = await make_user("employee", "Ann Acme"), await make_user("employee", "Ola Other")
    await in_company(ann, "AcmeTest")
    await in_company(ola, "OtherTest")

    urls = {}
    for who in (ann, ola):
        url = urlparse((await client.post("/integrations/google/connect", headers=who.headers)).json()["auth_url"])
        urls[who.id] = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert urls[ann.id]["client_id"] == "acme-client-id.apps.googleusercontent.com"
    assert urls[ola.id]["client_id"] == "other-client-id.apps.googleusercontent.com"
    assert urls[ann.id]["redirect_uri"] == urls[ola.id]["redirect_uri"] == settings.GOOGLE_REDIRECT_URI

    r = await client.get("/integrations/google/callback", params={"code": "c", "state": urls[ola.id]["state"], "scope": " ".join(gclient.ALL_SCOPES)})
    assert "result=connected" in r.headers["location"]
    exchange = [c[2]["form"] for c in google.calls if c[1] == "/token"][-1]
    assert exchange["client_id"] == "other-client-id.apps.googleusercontent.com" and exchange["client_secret"] == "other-client-secret"
    await wait_for_pushes()
    raw = await IntegrationConnection.get_motor_collection().find_one({"user_id": ola.user.id})
    assert raw["config"]["company"] == "OtherTest"


async def test_refreshing_uses_the_company_the_connection_was_made_under(client, alice, google):
    conn = await connect_user(alice)
    conn.config["company"] = "OtherTest"  # connected under OtherTest ...
    conn.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await conn.save()
    await in_company(alice, "AcmeTest")  # ... and the person now works for AcmeTest
    await sync(client, alice)
    refresh = [c[2]["form"] for c in google.calls if c[1] == "/token"][-1]
    assert refresh["client_id"] == "other-client-id.apps.googleusercontent.com" and refresh["client_secret"] == "other-client-secret"


async def test_sync_reports_missing_keys_instead_of_crashing(client, alice, google):
    conn = await connect_user(alice)
    conn.config["company"] = "Gone Inc"
    await conn.save()
    out = await sync(client, alice)
    assert out["status"] == "connected" and out["last_error"] == "Google not configured for Gone Inc"
    assert not google.calls


async def test_client_config_gives_the_frontend_its_own_companys_id_and_key_but_never_the_secret(client, alice, bob, client_user):
    await in_company(bob, "OtherTest")
    mine = (await client.get("/integrations/google/client-config", headers=alice.headers)).json()
    assert mine == {
        "configured": True, "company": "AcmeTest", "client_id": "acme-client-id.apps.googleusercontent.com",
        "api_key": "acme-api-key", "message": None,
    }
    theirs = await client.get("/integrations/google/client-config", headers=bob.headers)
    assert theirs.json()["client_id"] == "other-client-id.apps.googleusercontent.com" and theirs.json()["api_key"] == "other-api-key"
    assert "secret" not in (mine | theirs.json()).__str__().lower()
    assert (await client.get("/integrations/google/client-config")).status_code == 401
    assert (await client.get("/integrations/google/client-config", headers=client_user.headers)).status_code == 403


async def _state(client, person) -> str:
    url = (await client.post("/integrations/google/connect", headers=person.headers)).json()["auth_url"]
    return parse_qs(urlparse(url).query)["state"][0]


async def test_callback_stores_encrypted_tokens_and_starts_syncing(client, alice, google):
    google.events["alice@example.com"] = [timed("e1", "Standup", *soon())]
    state = await _state(client, alice)
    r = await client.get("/integrations/google/callback", params={"code": "auth-code", "state": state, "scope": " ".join(gclient.ALL_SCOPES)})
    assert r.status_code == 303
    assert r.headers["location"].startswith("http://localhost:5173/app/settings/connected-apps?")
    assert "result=connected" in r.headers["location"]

    exchange = [c[2]["form"] for c in google.calls if c[1] == "/token"][0]
    assert exchange["code"] == "auth-code" and exchange["grant_type"] == "authorization_code"

    raw = await IntegrationConnection.get_motor_collection().find_one({"user_id": alice.user.id})
    assert "access-1" not in str(raw) and "refresh-1" not in str(raw)  # ciphertext only
    assert crypto.decrypt(raw["refresh_token"]) == "refresh-1"
    assert raw["account"] == "alice@example.com"
    # Only the primary calendar is ticked at first; the person chooses the rest.
    assert [(c["id"], c["selected"]) for c in raw["config"]["calendars"]] == [("alice@example.com", True), ("team@group.calendar.google.com", False)]

    await wait_for_pushes()  # the first sync runs in the background
    assert await titles(alice) == {"Standup"}
    assert (await Notification.find(Notification.user_id == alice.user.id, Notification.type == "integration_connected").count()) == 1


async def test_status_never_exposes_tokens(client, alice, google):
    await connect_user(alice)
    body = (await client.get("/integrations", headers=alice.headers)).text
    assert "access-1" not in body and "refresh-1" not in body and "token" not in body.lower().replace("sync_token", "")
    conn = (await client.get("/integrations", headers=alice.headers)).json()[0]["connection"]
    assert conn["status"] == "connected" and conn["account"] == "alice@example.com" and conn["last_sync_at"] is None


async def test_callback_rejects_bad_state_denied_and_missing_scopes(client, alice, google):
    r = await client.get("/integrations/google/callback", params={"code": "x", "state": "forged"})
    assert r.status_code == 303 and "result=error" in r.headers["location"]
    assert await IntegrationConnection.find_all().count() == 0

    state = await _state(client, alice)
    r = await client.get("/integrations/google/callback", params={"error": "access_denied", "state": state})
    assert "result=denied" in r.headers["location"]

    google.token_response["scope"] = gclient.SCOPE_CALENDAR_LIST  # they unticked "see and edit events"
    r = await client.get("/integrations/google/callback", params={"code": "x", "state": state})
    assert "result=error" in r.headers["location"]
    assert await IntegrationConnection.find_all().count() == 0
    assert any(c[1] == "/revoke" for c in google.calls)  # the half-grant is revoked, not kept


async def test_reconnecting_keeps_choices_and_old_refresh_token(client, alice, google):
    await connect_user(alice, selected=["alice@example.com", "team@group.calendar.google.com"])
    google.token_response = {"access_token": "access-9", "expires_in": 3600, "scope": " ".join(gclient.ALL_SCOPES)}  # no refresh token this time
    state = await _state(client, alice)
    r = await client.get("/integrations/google/callback", params={"code": "x", "state": state})
    assert "result=connected" in r.headers["location"]
    await wait_for_pushes()
    assert await IntegrationConnection.find_all().count() == 1
    conn = await IntegrationConnection.find_one(IntegrationConnection.user_id == alice.user.id)
    assert crypto.decrypt(conn.refresh_token) == "refresh-1"
    assert {c["id"] for c in conn.config["calendars"] if c["selected"]} == {"alice@example.com", "team@group.calendar.google.com"}


# --- Google -> Task Manager ------------------------------------------------------------------------------------------
async def test_sync_pulls_selected_calendars_including_recurring_and_all_day(client, alice, google):
    await connect_user(alice)
    a, b = soon(2, 8)
    google.events["alice@example.com"] = [
        timed("one", "Design review", a, b, location="Room 4"),
        timed("rec_20261101", "Weekly sync (instance 1)", a + timedelta(days=1), b + timedelta(days=1), recurringEventId="rec"),
        timed("rec_20261108", "Weekly sync (instance 2)", a + timedelta(days=8), b + timedelta(days=8), recurringEventId="rec"),
        {"id": "ooo", "status": "confirmed", "summary": "Out of office", "start": {"date": "2026-11-20"}, "end": {"date": "2026-11-22"}},
        timed("free", "Focus time", a, b, transparency="transparent"),
        timed("declined", "Declined thing", a, b, attendees=[{"self": True, "responseStatus": "declined"}]),
        timed("ours", "Echo of a TM booking", a, b, extendedProperties={"private": {"tm_source": "task-manager"}}),
        {"id": "dead", "status": "cancelled"},
    ]
    google.events["team@group.calendar.google.com"] = [timed("t1", "Not ticked", a, b)]
    out = await sync(client, alice)
    assert out["last_sync_at"] and out["last_error"] is None

    assert await titles(alice) == {"Design review", "Weekly sync (instance 1)", "Weekly sync (instance 2)", "Out of office", "Focus time", "Declined thing"}
    rows = {e.external_id: e for e in await ExternalEvent.find(ExternalEvent.user_id == alice.user.id).to_list()}
    assert rows["one"].location == "Room 4" and rows["one"].busy and not rows["one"].all_day
    assert rows["ooo"].all_day and (rows["ooo"].end - rows["ooo"].start) == timedelta(days=2)
    assert rows["free"].busy is False and rows["declined"].busy is False
    sent = google.of("GET", "alice@example.com/events")[0]["params"]
    assert sent["singleEvents"] == "true" and "timeMin" in sent and "syncToken" not in sent
    assert not google.of("GET", "team@group.calendar.google.com/events")  # unticked calendars aren't read


async def test_incremental_sync_uses_the_sync_token_and_applies_changes(client, alice, google):
    await connect_user(alice)
    a, b = soon()
    google.events["alice@example.com"] = [timed("e1", "Old title", a, b), timed("e2", "To be cancelled", a, b)]
    await sync(client, alice)
    conn = await IntegrationConnection.find_one(IntegrationConnection.user_id == alice.user.id)
    assert conn.config["calendars"][0]["sync_token"] == "tok-full"

    google.delta["alice@example.com"] = [timed("e1", "New title", a, b + timedelta(hours=1)), {"id": "e2", "status": "cancelled"}, timed("e3", "Brand new", a, b)]
    await sync(client, alice)
    last = google.of("GET", "alice@example.com/events")[-1]["params"]
    assert last["syncToken"] == "tok-full" and "timeMin" not in last  # Google forbids both together
    assert await titles(alice) == {"New title", "Brand new"}
    conn = await IntegrationConnection.find_one(IntegrationConnection.user_id == alice.user.id)
    assert conn.config["calendars"][0]["sync_token"] == "tok-incremental"


async def test_expired_sync_token_triggers_a_clean_full_resync(client, alice, google):
    await connect_user(alice)
    a, b = soon()
    google.events["alice@example.com"] = [timed("e1", "Kept", a, b), timed("e2", "Gone", a, b)]
    await sync(client, alice)
    google.events["alice@example.com"] = [timed("e1", "Kept", a, b)]
    google.gone_once = True  # 410 on the incremental call
    out = await sync(client, alice)
    assert out["last_error"] is None
    assert await titles(alice) == {"Kept"}  # the full resync also removed what Google no longer lists


async def test_choosing_calendars_adds_and_removes_their_events(client, alice, google):
    await connect_user(alice)
    a, b = soon()
    google.events["alice@example.com"] = [timed("e1", "Mine", a, b)]
    google.events["team@group.calendar.google.com"] = [timed("t1", "Team offsite", a, b)]
    await sync(client, alice)
    assert await titles(alice) == {"Mine"}

    r = await client.put("/integrations/google/config", json={"selected": ["alice@example.com", "team@group.calendar.google.com"]}, headers=alice.headers)
    assert r.status_code == 200 and all(c["selected"] for c in r.json()["config"]["calendars"])
    await wait_for_pushes()
    assert await titles(alice) == {"Mine", "Team offsite"}

    await client.put("/integrations/google/config", json={"selected": ["team@group.calendar.google.com"]}, headers=alice.headers)
    await wait_for_pushes()
    assert await titles(alice) == {"Team offsite"}


async def test_config_validation(client, alice, bob, google):
    await connect_user(alice)
    r = await client.put("/integrations/google/config", json={"selected": ["someone-elses@gmail.com"]}, headers=alice.headers)
    assert r.status_code == 422
    r = await client.put("/integrations/google/config", json={"write_calendar": "nope"}, headers=alice.headers)
    assert r.status_code == 422
    assert (await client.put("/integrations/google/config", json={"selected": []}, headers=bob.headers)).status_code == 404  # bob isn't connected


# --- Privacy ---------------------------------------------------------------------------------------------------------
async def test_only_the_owner_sees_details_everyone_else_sees_busy(client, alice, bob, admin, client_user, google):
    await connect_user(alice)
    a, b = soon()
    google.events["alice@example.com"] = [
        timed("e1", "Secret: layoffs plan", a, b, location="HR room"),
        timed("e2", "Lunch (free)", a, b, transparency="transparent"),
    ]
    await sync(client, alice)
    params = {"host_user_id": alice.id, "from": day(0), "to": day(5)}

    mine = (await client.get("/external-events", params=params, headers=alice.headers)).json()
    assert {e["title"] for e in mine} == {"Secret: layoffs plan", "Lunch (free)"}
    assert [e["location"] for e in mine if e["title"].startswith("Secret")] == ["HR room"]

    for viewer in (bob, admin):  # not even admins read someone else's Google details
        theirs = (await client.get("/external-events", params=params, headers=viewer.headers)).json()
        assert [e["title"] for e in theirs] == ["Busy"]  # and "free" events don't appear at all
        assert theirs[0]["private"] is True and theirs[0]["location"] == "" and theirs[0]["html_link"] == ""
        assert "layoffs" not in str(theirs) and "HR room" not in str(theirs)

    assert (await client.get("/external-events", params=params)).status_code == 401
    assert (await client.get("/external-events", params=params, headers=client_user.headers)).status_code == 403  # no team link


async def test_connections_are_per_user(client, alice, bob, google):
    await connect_user(alice)
    assert (await client.get("/integrations", headers=bob.headers)).json()[0]["connection"] is None
    assert (await client.post("/integrations/google/sync", headers=bob.headers)).status_code == 404
    assert (await client.delete("/integrations/google", headers=bob.headers)).status_code == 404
    assert await IntegrationConnection.find_all().count() == 1  # bob's attempts didn't touch alice's


async def test_google_busy_blocks_booking_and_availability(client, alice, bob, google):
    await connect_user(alice)
    a, b = soon(2, 8, 60)  # 08:00 UTC = 13:30 IST, inside working hours
    google.events["alice@example.com"] = [
        timed("e1", "Dentist", a, b),
        {"id": "allday", "status": "confirmed", "summary": "Conference", "start": {"date": a.date().isoformat()}, "end": {"date": (a.date() + timedelta(days=1)).isoformat()}},
    ]
    await sync(client, alice)
    r = await client.post("/bookings", json={"host_user_id": alice.id, "start": iso(a + timedelta(minutes=15)), "end": iso(b + timedelta(minutes=15)), "title": "Chat"}, headers=bob.headers)
    assert r.status_code == 409 and "busy" in r.json()["detail"]
    assert "Dentist" not in r.text

    local_day = a.astimezone(tz()).date().isoformat()
    av = (await client.get("/bookings/availability", params={"host_user_id": alice.id, "date": local_day}, headers=bob.headers)).json()
    starts = {s["start"] for s in av["slots"]}
    assert av["slots"] and not any(a <= datetime.fromisoformat(s.replace("Z", "+00:00")) < b for s in starts)  # the dentist hour is gone, the all-day event doesn't block the day

    ok = await client.post("/bookings", json={"host_user_id": alice.id, "start": iso(b), "end": iso(b + timedelta(minutes=30)), "title": "After"}, headers=bob.headers)
    assert ok.status_code == 201


# --- Task Manager -> Google ------------------------------------------------------------------------------------------
async def test_bookings_create_update_and_delete_google_events_for_host_and_booker(client, alice, bob, google):
    await connect_user(alice)
    await connect_user(bob)
    a, b = soon(3, 8)
    r = await client.post("/bookings", json={"host_user_id": alice.id, "start": iso(a), "end": iso(b), "title": "Design review", "note": "Bring mockups"}, headers=bob.headers)
    assert r.status_code == 201
    booking = r.json()
    await wait_for_pushes()

    eid = f"tmb{booking['id']}"
    sent = {c["json"]["summary"]: c["json"] for c in google.of("POST", "/events") + google.of("PUT", "/events")}
    host_copy, booker_copy = sent["Design review"], sent["Design review · Alice Employee"]
    assert "Booked by Bob Employee" in host_copy["description"] and "Bring mockups" in host_copy["description"]
    assert "With Alice Employee" in booker_copy["description"]
    assert host_copy["id"] == eid and host_copy["start"]["dateTime"] == a.isoformat()
    assert host_copy["extendedProperties"]["private"]["tm_source"] == "task-manager"  # so pulling never echoes it back
    # Both connections write to "their" primary calendar (one shared fake calendar here), so each gets a link.
    assert await IntegrationLink.find(IntegrationLink.kind == "booking").count() == 2

    calls_before = len(google.calls)
    await sync(client, alice)  # nothing changed: no writes
    assert not [c for c in google.calls[calls_before:] if c[0] in ("POST", "PUT", "DELETE") and "/events" in c[1]]

    assert (await client.delete(f"/bookings/{booking['id']}", headers=alice.headers)).status_code == 204
    await wait_for_pushes()
    assert eid not in google.written["alice@example.com"]
    assert await IntegrationLink.find_all().count() == 0
    assert await Booking.find_all().count() == 0


async def test_task_due_dates_create_update_and_delete_events(client, team, google):
    mia = team.mia
    await connect_user(mia)
    t = await make_task(client, team, assignee=mia, due_date=day(5))
    await wait_for_pushes()

    eid = f"tmt{t['id']}"
    ev = google.written["alice@example.com"][eid]
    assert ev["summary"] == "Due: Write homepage copy"
    assert ev["start"] == {"date": day(5)} and ev["end"] == {"date": day(6)}  # an all-day event, end exclusive
    assert ev["transparency"] == "transparent"  # a due date mustn't make Mia look busy

    r = await client.patch(f"/tasks/{t['id']}", json={"due_date": day(7), "title": "Write the homepage"}, headers=team.hana.headers)
    assert r.status_code == 200
    await wait_for_pushes()
    ev = google.written["alice@example.com"][eid]
    assert ev["summary"] == "Due: Write the homepage" and ev["start"] == {"date": day(7)}
    assert any(c[0] == "PUT" for c in google.calls)

    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 204
    await wait_for_pushes()
    assert eid not in google.written["alice@example.com"]
    assert await IntegrationLink.find_all().count() == 0


async def test_reassigning_or_approving_a_task_removes_it_from_the_old_calendar(client, team, google):
    await connect_user(team.mia)
    await connect_user(team.max)
    t = await make_task(client, team, assignee=team.mia, due_date=day(4))
    await wait_for_pushes()
    eid = f"tmt{t['id']}"
    assert eid in google.written["alice@example.com"]

    r = await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.max.id}, headers=team.hana.headers)
    assert r.status_code == 200
    await wait_for_pushes()
    links = await IntegrationLink.find(IntegrationLink.kind == "task").to_list()
    assert [l.user_id for l in links] == [team.max.user.id]  # Mia's event is gone, Max's exists

    sub = await client.post(f"/tasks/{t['id']}/submit", json={"note": "done", "approver_id": team.hana.id}, headers=team.max.headers)
    assert sub.status_code == 201
    review_id = sub.json()["id"]
    assert (await client.post(f"/reviews/{review_id}/approve", json={}, headers=team.hana.headers)).status_code == 200
    await wait_for_pushes()
    assert await IntegrationLink.find(IntegrationLink.kind == "task").count() == 0  # approved: off the calendar


async def test_tasks_without_a_due_date_are_not_sent_and_people_without_google_are_untouched(client, team, google):
    await connect_user(team.mia)
    await make_task(client, team, assignee=team.mia)  # no due date
    await make_task(client, team, assignee=team.max, due_date=day(3))  # Max never connected
    await wait_for_pushes()
    assert not google.written
    assert not [c for c in google.calls if c[0] in ("POST", "PUT") and "/events" in c[1]]


async def test_an_event_the_person_deleted_on_google_comes_back_instead_of_duplicating(client, team, google):
    await connect_user(team.mia)
    t = await make_task(client, team, assignee=team.mia, due_date=day(4))
    await wait_for_pushes()
    eid = f"tmt{t['id']}"
    google.written["alice@example.com"].pop(eid)  # deleted in Google's UI
    await IntegrationLink.find_all().update({"$set": {"fingerprint": "stale"}})
    await sync(client, team.mia)
    assert eid in google.written["alice@example.com"]
    assert await IntegrationLink.find_all().count() == 1


async def test_write_calendar_can_be_changed_and_events_move(client, team, google):
    await connect_user(team.mia)
    t = await make_task(client, team, assignee=team.mia, due_date=day(4))
    await wait_for_pushes()
    eid = f"tmt{t['id']}"
    r = await client.put("/integrations/google/config", json={"write_calendar": "team@group.calendar.google.com"}, headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["config"]["write_calendar"] == "team@group.calendar.google.com"
    await wait_for_pushes()
    assert eid in google.written["team@group.calendar.google.com"] and eid not in google.written["alice@example.com"]


# --- Tokens, errors ---------------------------------------------------------------------------------------------------
async def test_expired_access_token_is_refreshed_and_stored_encrypted(client, alice, google):
    conn = await connect_user(alice)
    conn.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await conn.save()
    await sync(client, alice)
    assert any(c[1] == "/token" and c[2]["form"]["grant_type"] == "refresh_token" for c in google.calls)
    assert google.of("GET", "calendarList")[0]["auth"] == "Bearer access-2"
    raw = await IntegrationConnection.get_motor_collection().find_one({"user_id": alice.user.id})
    assert "access-2" not in str(raw) and crypto.decrypt(raw["access_token"]) == "access-2"


async def test_revoked_access_marks_reconnect_notifies_once_and_shows_the_error(client, alice, google):
    conn = await connect_user(alice)
    conn.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await conn.save()
    google.refresh_error = {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}

    await sync(client, alice)
    shown = (await client.get("/integrations", headers=alice.headers)).json()[0]["connection"]
    assert shown["status"] == "needs_reconnect" and "revoked" in shown["last_error"] and shown["last_error_at"]
    assert await Notification.find(Notification.user_id == alice.user.id, Notification.type == "integration_error").count() == 1

    assert (await client.post("/integrations/google/sync", headers=alice.headers)).status_code == 409
    assert await run_integration_sync() == 0  # the background job leaves dead connections alone
    assert await Notification.find(Notification.type == "integration_error").count() == 1


async def test_transient_google_errors_are_recorded_but_keep_the_connection(client, alice, google, monkeypatch):
    await connect_user(alice)
    google.cal_list_status = 503
    out = await sync(client, alice)
    assert out["status"] == "connected" and "503" in out["last_error"]
    assert await Notification.find(Notification.type == "integration_error").count() == 0  # not worth a popup
    google.cal_list_status = 200
    assert (await sync(client, alice))["last_error"] is None  # and it heals itself


async def test_background_job_syncs_every_connected_user(client, alice, bob, google):
    await connect_user(alice)
    await connect_user(bob)
    a, b = soon()
    google.events["alice@example.com"] = [timed("e1", "Shared fake event", a, b)]
    assert await run_integration_sync() == 2
    assert await titles(alice) == await titles(bob) == {"Shared fake event"}
    assert all(c.last_sync_at for c in await IntegrationConnection.find_all().to_list())


# --- Disconnect ------------------------------------------------------------------------------------------------------
async def test_disconnect_revokes_the_token_and_forgets_everything(client, team, google):
    mia = team.mia
    await connect_user(mia)
    google.events["alice@example.com"] = [timed("e1", "Dentist", *soon())]
    await make_task(client, team, assignee=mia, due_date=day(4))
    await wait_for_pushes()
    await sync(client, mia)
    assert await ExternalEvent.find_all().count() == 1 and await IntegrationLink.find_all().count() == 1

    r = await client.delete("/integrations/google", headers=mia.headers)
    assert r.status_code == 200 and r.json() == {"revoked": True}
    revoke = [c for c in google.calls if c[1] == "/revoke"][0]
    assert revoke[2]["form"] == {"token": ["refresh-1"]}
    assert await IntegrationConnection.find_all().count() == 0
    assert await ExternalEvent.find_all().count() == 0 and await IntegrationLink.find_all().count() == 0
    assert (await client.get("/integrations", headers=mia.headers)).json()[0]["connection"] is None
    assert await Notification.find(Notification.type == "integration_disconnected").count() == 1


# --- Push notifications (webhook) ------------------------------------------------------------------------------------
async def test_channels_are_only_created_when_push_is_enabled_with_a_public_https_url(client, alice, google, monkeypatch):
    await connect_user(alice)
    await sync(client, alice)
    assert not google.of("POST", "/watch")

    monkeypatch.setattr(settings, "GOOGLE_PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "http://localhost:8000")  # not HTTPS: Google would refuse it
    await sync(client, alice)
    assert not google.of("POST", "/watch")

    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://tm.example.com")
    out = await sync(client, alice)
    watch = google.of("POST", "/watch")
    assert len(watch) == 1
    assert watch[0]["json"]["address"] == "https://tm.example.com/api/v1/integrations/google/webhook"
    assert watch[0]["json"]["token"] == channel_token(watch[0]["json"]["id"])
    assert out["config"]["push_active"] is True

    await sync(client, alice)
    assert len(google.of("POST", "/watch")) == 1  # a live channel isn't recreated

    monkeypatch.setattr(settings, "GOOGLE_PUSH_ENABLED", False)  # switched off again: channels are stopped
    out = await sync(client, alice)
    assert google.of("POST", "/channels/stop") and out["config"]["push_active"] is False


async def test_a_channel_close_to_expiry_is_renewed(client, alice, google, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://tm.example.com")
    await connect_user(alice)
    await sync(client, alice)
    conn = await IntegrationConnection.find_one(IntegrationConnection.user_id == alice.user.id)
    conn.config["calendars"][0]["channel"]["expires_at"] = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    await conn.save()
    await sync(client, alice)
    assert len(google.of("POST", "/watch")) == 2 and len(google.of("POST", "/channels/stop")) == 1


async def test_failing_to_start_push_does_not_break_syncing(client, alice, google, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://tm.example.com")
    google.watch_error = True
    await connect_user(alice)
    out = await sync(client, alice)
    assert out["status"] == "connected" and out["last_error"] is None
    assert "push" in out["config"]["push_error"].lower() and out["config"]["push_active"] is False


async def test_webhook_triggers_an_incremental_sync_and_checks_the_token(client, alice, google, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "https://tm.example.com")
    await connect_user(alice)
    a, b = soon()
    await sync(client, alice)
    channel = (await IntegrationConnection.find_one(IntegrationConnection.user_id == alice.user.id)).config["calendars"][0]["channel"]["id"]

    good = {"X-Goog-Channel-ID": channel, "X-Goog-Channel-Token": channel_token(channel), "X-Goog-Resource-State": "exists"}
    google.delta["alice@example.com"] = [timed("pushed", "Added just now", a, b)]

    assert (await client.post("/integrations/google/webhook", headers={**good, "X-Goog-Channel-Token": "wrong"})).status_code == 403
    assert (await client.post("/integrations/google/webhook")).status_code == 400
    assert (await client.post("/integrations/google/webhook", headers={**good, "X-Goog-Resource-State": "sync"})).status_code == 204
    await wait_for_pushes()
    assert await titles(alice) == set()  # neither the bad token nor the hello triggered anything

    assert (await client.post("/integrations/google/webhook", headers=good)).status_code == 204
    await wait_for_pushes()
    assert await titles(alice) == {"Added just now"}

    ghost = "0" * 32
    assert (await client.post("/integrations/google/webhook", headers={"X-Goog-Channel-ID": ghost, "X-Goog-Channel-Token": channel_token(ghost), "X-Goog-Resource-State": "exists"})).status_code == 404
