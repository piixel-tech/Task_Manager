"""Phase 11b: Drive, Docs, Sheets and Meet on top of the Google connection. Only Google's HTTP endpoints are faked (respx)."""
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from app.integrations.google import client as gclient
from app.integrations.runner import wait_for_pushes
from app.models import Booking, File, IntegrationConnection, Notification, Subfolder
from tests.test_chat import group  # noqa: F401
from tests.test_google_integration import (  # noqa: F401  (the autouse fixtures keep these tests isolated like the Calendar ones)
    FakeGoogle,
    _default_company,
    _let_background_work_finish,
    _no_retry_sleep,
    connect_user,
    iso,
    soon,
)
from tests.test_tasks import make_task, team  # noqa: F401

DRIVE_FILE = re.compile(r"https://www\.googleapis\.com/drive/v3/files/(?P<id>[^/?]+)(?:\?.*)?$")
DRIVE_FILES = re.compile(r"https://www\.googleapis\.com/drive/v3/files(?:\?.*)?$")
DOC_ID = "1AbCdEfGhIjKlMnOp"


class WorkspaceGoogle(FakeGoogle):
    """The Calendar fake plus Drive, and Meet links on events that ask for one."""

    def __init__(self, router: respx.MockRouter):
        super().__init__(router)
        self.drive: dict[str, dict] = {
            DOC_ID: {
                "id": DOC_ID, "name": "Brief", "mimeType": "application/vnd.google-apps.document",
                "webViewLink": f"https://docs.google.com/document/d/{DOC_ID}/edit", "iconLink": "https://ssl.gstatic.com/doc.png",
                "modifiedTime": "2026-10-01T09:30:00.000Z",
            }
        }
        self.meets = 0
        self.reject_next = 0  # Drive answers 401 this many times (an access token that died early)
        self.refuse_meet = False  # an account that cannot make Meet links
        router.get(DRIVE_FILE).mock(side_effect=self._drive_get)
        router.post(DRIVE_FILES).mock(side_effect=self._drive_create)
        router.get(DRIVE_FILES).mock(side_effect=self._drive_list)
        self.listing: dict = {"files": []}

    def _drive_get(self, request, **_groups):
        fid = DRIVE_FILE.match(str(request.url)).group("id")
        self.calls.append(("GET", f"/drive/{fid}", {"auth": request.headers.get("authorization")}))
        if self.reject_next:
            self.reject_next -= 1
            return httpx.Response(401, json={"error": {"code": 401, "message": "Invalid Credentials", "errors": [{"reason": "authError"}]}})
        if fid not in self.drive:  # drive.file: a file the app was never given looks like a missing one
            return httpx.Response(404, json={"error": {"code": 404, "message": "File not found", "errors": [{"reason": "notFound"}]}})
        return httpx.Response(200, json=self.drive[fid])

    def _drive_list(self, request, **_groups):
        self.calls.append(("GET", "/drive/list", {"params": dict(request.url.params), "auth": request.headers.get("authorization")}))
        return httpx.Response(200, json=self.listing)

    def _drive_create(self, request, **_groups):
        import json

        body = json.loads(request.content)
        self.calls.append(("POST", "/drive/files", {"json": body, "params": dict(request.url.params)}))
        fid = f"new{len(self.drive):03d}abcdefgh"
        kind = "document" if body["mimeType"].endswith("document") else "spreadsheets"
        meta = {
            "id": fid, "name": body["name"], "mimeType": body["mimeType"],
            "webViewLink": f"https://docs.google.com/{kind}/d/{fid}/edit", "modifiedTime": "2026-11-03T08:00:00.000Z",
        }
        self.drive[fid] = meta
        return httpx.Response(200, json=meta)

    def _insert(self, request, **groups):
        if self.refuse_meet and request.url.params.get("conferenceDataVersion"):
            self._rec(request)
            return httpx.Response(400, json={"error": {"code": 400, "message": "Invalid conference type value.", "errors": [{"reason": "invalid"}]}})
        resp = super()._insert(request, **groups)
        info = self.calls[-1][2]
        if resp.status_code == 200 and info["params"].get("conferenceDataVersion") == "1" and info["json"].get("conferenceData"):
            self.meets += 1
            return httpx.Response(200, json={**info["json"], "hangoutLink": f"https://meet.google.com/abc-defg-{self.meets:03d}"})
        return resp


@pytest.fixture
def wg():
    with respx.mock(assert_all_called=False, assert_all_mocked=True, using="httpcore") as router:
        yield WorkspaceGoogle(router)


ALL_SCOPES = gclient.ALL_SCOPES


async def with_drive(person, **fields) -> IntegrationConnection:
    conn = await connect_user(person, **fields)
    conn.scopes = ALL_SCOPES
    await conn.save()
    return conn


def problem(r) -> dict:
    assert r.status_code == 409, r.text
    return r.json()["detail"]


# --- One Connect to Google ---------------------------------------------------------------------------------------------
def consent_query(r) -> dict:
    return {k: v[0] for k, v in parse_qs(urlparse(r.json()["auth_url"]).query).items()}


async def test_one_connect_asks_for_every_scope_at_once(client, alice):
    q = consent_query(await client.post("/integrations/google/connect", headers=alice.headers))
    assert set(q["scope"].split()) == set(gclient.ALL_SCOPES) and len(q["scope"].split()) == 4
    assert "drive.readonly" in q["scope"] and "drive.file" in q["scope"] and "calendar.events" in q["scope"]
    assert "login_hint" not in q  # first time: any Google account


async def test_reconnecting_asks_for_everything_again_on_the_same_google_account(client, alice):
    await connect_user(alice)
    q = consent_query(await client.post("/integrations/google/connect", headers=alice.headers))
    assert set(q["scope"].split()) == set(gclient.ALL_SCOPES) and q["login_hint"] == "alice@example.com"


async def test_an_older_connection_gets_one_reconnect_prompt_and_keeps_working_meanwhile(client, alice, wg):
    conn = await connect_user(alice)
    conn.scopes = list(gclient.SCOPES)  # made before Drive was added
    await conn.save()
    out = (await client.get("/integrations", headers=alice.headers)).json()[0]["connection"]
    assert out["status"] == "connected" and out["config"]["missing"] == ["Drive", "Docs & Sheets"]
    assert problem(await client.get("/integrations/google/drive/files", headers=alice.headers))["code"] == "missing_scope"

    state = consent_query(await client.post("/integrations/google/connect", headers=alice.headers))["state"]
    wg.token_response["scope"] = " ".join(ALL_SCOPES)
    r = await client.get("/integrations/google/callback", params={"code": "c", "state": state, "scope": " ".join(ALL_SCOPES)})
    assert "result=connected" in r.headers["location"]
    await wait_for_pushes()
    fresh = (await client.get("/integrations", headers=alice.headers)).json()[0]["connection"]
    assert fresh["config"]["missing"] == [] and set((await IntegrationConnection.find_one()).scopes) == set(ALL_SCOPES)


async def test_unticking_boxes_on_googles_screen_keeps_calendar_working_and_says_so(client, alice, wg):
    state = consent_query(await client.post("/integrations/google/connect", headers=alice.headers))["state"]
    wg.token_response["scope"] = " ".join(gclient.SCOPES)
    r = await client.get("/integrations/google/callback", params={"code": "c", "state": state, "scope": " ".join(gclient.SCOPES)})
    assert "result=partial" in r.headers["location"] and "Drive" in r.headers["location"]
    await wait_for_pushes()
    conn = await IntegrationConnection.find_one(IntegrationConnection.user_id == alice.user.id)
    assert conn.status == "connected" and set(conn.scopes) == set(gclient.SCOPES)


async def test_unticking_calendar_is_refused_and_a_working_connection_is_not_revoked(client, alice, wg):
    await connect_user(alice)
    state = consent_query(await client.post("/integrations/google/connect", headers=alice.headers))["state"]
    only_drive = [gclient.SCOPE_DRIVE_FILE]
    wg.token_response["scope"] = " ".join(only_drive)
    r = await client.get("/integrations/google/callback", params={"code": "c", "state": state, "scope": " ".join(only_drive)})
    assert "result=error" in r.headers["location"]
    assert not [c for c in wg.calls if c[1] == "/revoke"]  # revoking would have killed the login that still works
    assert (await IntegrationConnection.find_one()).status == "connected"


async def test_a_refresh_that_reports_fewer_scopes_is_remembered(client, alice, wg, monkeypatch):
    conn = await with_drive(alice)
    conn.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await conn.save()

    async def refresh_without_drive(creds, token):  # they removed Drive from their Google account's permissions
        return {"access_token": "access-9", "expires_in": 3600, "scope": " ".join(gclient.SCOPES)}

    monkeypatch.setattr(gclient, "refresh_access_token", refresh_without_drive)
    assert (await client.get("/integrations/google/drive/files", headers=alice.headers)).status_code == 200  # this call began with Drive
    assert set((await IntegrationConnection.get(conn.id)).scopes) == set(gclient.SCOPES)
    assert problem(await client.get("/integrations/google/drive/files", headers=alice.headers))["code"] == "missing_scope"
    missing = (await client.get("/integrations", headers=alice.headers)).json()[0]["connection"]["config"]["missing"]
    assert "Drive" in missing


# --- Settings > Connected apps ------------------------------------------------------------------------------------------
async def test_a_complete_connection_reports_nothing_missing(client, alice):
    await connect_user(alice)
    assert (await client.get("/integrations", headers=alice.headers)).json()[0]["connection"]["config"]["missing"] == []


# --- Drive: attaching ---------------------------------------------------------------------------------------
async def test_google_routes_need_a_signed_in_staff_member(client, client_user):
    assert (await client.get("/integrations/google/drive/files")).status_code == 401
    for path, body in (("drive/attach", {"drive_id": DOC_ID}), ("drive/create", {"kind": "document"})):
        r = await client.post(f"/integrations/google/{path}", json=body, headers=client_user.headers)
        assert r.status_code == 403, path
    assert (await client.get("/integrations/google/drive/files", headers=client_user.headers)).status_code == 403


async def test_each_missing_piece_has_its_own_clear_answer(client, alice, wg):
    d = problem(await client.get("/integrations/google/drive/files", headers=alice.headers))
    assert d["code"] == "not_connected" and "Connected apps" in d["message"]

    conn = await connect_user(alice)
    conn.scopes = list(gclient.SCOPES)  # Calendar only
    await conn.save()
    d = problem(await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=alice.headers))
    assert (d["code"], d["service"]) == ("missing_scope", "drive")
    d = problem(await client.post("/integrations/google/drive/create", json={"kind": "spreadsheet"}, headers=alice.headers))
    assert (d["code"], d["service"]) == ("missing_scope", "docs_sheets")

    conn.scopes, conn.status = ALL_SCOPES, "needs_reconnect"
    await conn.save()
    assert problem(await client.get("/integrations/google/drive/files", headers=alice.headers))["code"] == "reconnect"
    assert not wg.calls  # none of that reached Google


async def test_attaching_a_picked_file_stores_a_link_and_facts_checked_with_google(client, alice, wg):
    await with_drive(alice)
    r = await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=alice.headers)
    assert r.status_code == 201, r.text
    f = r.json()
    assert (f["kind"], f["name"], f["url"], f["size"]) == ("link", "Brief", f"https://docs.google.com/document/d/{DOC_ID}/edit", 0)
    assert f["drive"]["file_id"] == DOC_ID and f["drive"]["kind"] == "document" and f["drive"]["modified_at"].startswith("2026-10-01T09:30")
    row = await File.get(f["id"])
    assert row.owner_id == alice.user.id and row.storage_key is None  # a link record: no bytes of ours
    assert wg.of("GET", "/drive/")[0]["auth"] == "Bearer access-1"


@pytest.mark.parametrize("bad", ["../etc/passwd", "short", "has space in it!", "x" * 300])
async def test_a_made_up_drive_id_is_refused_before_google_is_asked(client, alice, wg, bad):
    await with_drive(alice)
    assert (await client.post("/integrations/google/drive/attach", json={"drive_id": bad}, headers=alice.headers)).status_code == 422
    assert not [c for c in wg.calls if c[1].startswith("/drive")]


async def test_a_file_google_will_not_show_us_or_one_in_the_trash_is_not_attached(client, alice, wg):
    await with_drive(alice)
    r = await client.post("/integrations/google/drive/attach", json={"drive_id": "neverPickedFile1"}, headers=alice.headers)
    assert r.status_code == 404 and "Pick it again" in r.json()["detail"]
    wg.drive[DOC_ID]["trashed"] = True
    r = await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=alice.headers)
    assert r.status_code == 404 and "trash" in r.json()["detail"]
    assert await File.find_all().count() == 0


async def test_a_revoked_login_is_reported_once_marked_on_the_connection_and_asks_to_reconnect(client, alice, wg):
    conn = await with_drive(alice)
    conn.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    await conn.save()
    wg.refresh_error = {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}

    d = problem(await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=alice.headers))
    assert d["code"] == "reconnect" and "Reconnect" in d["message"]
    fresh = await IntegrationConnection.get(conn.id)
    assert fresh.status == "needs_reconnect" and "revoked" in fresh.last_error
    assert await Notification.find(Notification.user_id == alice.user.id, Notification.type == "integration_error").count() == 1

    # Trying again does not pile on notifications, and the answer is the cheap "reconnect" without calling Google.
    calls = len(wg.calls)
    assert problem(await client.get("/integrations/google/drive/files", headers=alice.headers))["code"] == "reconnect"
    assert len(wg.calls) == calls
    assert await Notification.find(Notification.user_id == alice.user.id, Notification.type == "integration_error").count() == 1


async def test_a_token_google_rejects_mid_request_is_refreshed_and_retried(client, alice, wg):
    await with_drive(alice)
    wg.reject_next = 1
    r = await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=alice.headers)
    assert r.status_code == 201, r.text
    assert [c["auth"] for c in wg.of("GET", "/drive/")] == ["Bearer access-1", "Bearer access-2"]


# --- Docs and Sheets ----------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("kind,mime", [("document", "application/vnd.google-apps.document"), ("spreadsheet", "application/vnd.google-apps.spreadsheet")])
async def test_new_doc_or_sheet_is_created_in_their_drive_and_linked(client, alice, wg, kind, mime):
    await with_drive(alice)
    r = await client.post("/integrations/google/drive/create", json={"kind": kind, "title": "  Launch plan "}, headers=alice.headers)
    assert r.status_code == 201, r.text
    sent = [c[2] for c in wg.calls if c[1] == "/drive/files"][0]
    assert sent["json"] == {"name": "Launch plan", "mimeType": mime}
    f = r.json()
    assert f["name"] == "Launch plan" and f["kind"] == "link" and f["drive"]["kind"] == kind and f["url"].startswith("https://docs.google.com/")


async def test_an_untitled_new_file_gets_a_default_name_and_other_kinds_are_refused(client, alice, wg):
    await with_drive(alice)
    r = await client.post("/integrations/google/drive/create", json={"kind": "document"}, headers=alice.headers)
    assert r.json()["name"] == "Untitled document"
    assert (await client.post("/integrations/google/drive/create", json={"kind": "presentation"}, headers=alice.headers)).status_code == 422


# --- Attached to tasks, chat and subfolders -----------------------------------------------------------------------------
async def test_a_drive_file_attaches_to_a_task_and_comes_back_with_its_drive_facts(client, team, wg):
    await with_drive(team.hana)
    f = (await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=team.hana.headers)).json()
    task = await make_task(client, team, asset_ids=[f["id"]])
    assert task["assets"][0]["drive"]["file_id"] == DOC_ID and task["assets"][0]["kind"] == "link"
    # Someone else's Drive link can't be borrowed.
    assert (await client.patch(f"/tasks/{task['id']}", json={"asset_ids": [f["id"]]}, headers=team.mia.headers)).status_code == 403


async def test_a_drive_file_can_be_sent_in_chat_as_a_file_card(client, team, wg):
    await with_drive(team.mia)
    f = (await client.post("/integrations/google/drive/attach", json={"drive_id": DOC_ID}, headers=team.mia.headers)).json()
    g = await group(client, team.mia, team.hana)
    r = await client.post(f"/chat/groups/{g['id']}/messages", json={"type": "file", "file_id": f["id"]}, headers=team.mia.headers)
    assert r.status_code == 201, r.text
    assert r.json()["file"]["drive"]["kind"] == "document"
    # Still not a way to post arbitrary links as files, or Drive links as photos.
    plain = await client.post("/files/link", json={"title": "x", "url": "https://example.com"}, headers=team.mia.headers)
    assert (await client.post(f"/chat/groups/{g['id']}/messages", json={"type": "file", "file_id": plain.json()["id"]}, headers=team.mia.headers)).status_code == 422
    assert (await client.post(f"/chat/groups/{g['id']}/messages", json={"type": "image", "file_id": f["id"]}, headers=team.mia.headers)).status_code == 422


async def test_subfolder_google_files_link_list_unlink_and_tell_the_team(client, team, wg):
    await with_drive(team.mia)
    f = (await client.post("/integrations/google/drive/create", json={"kind": "spreadsheet", "title": "Budget"}, headers=team.mia.headers)).json()
    url = f"/subfolders/{team.design.id}/files"

    r = await client.post(url, json={"file_id": f["id"]}, headers=team.mia.headers)
    assert r.status_code == 201, r.text
    assert [x["name"] for x in r.json()["files"]] == ["Budget"] and r.json()["can_write"] is True
    assert (await client.post(url, json={"file_id": f["id"]}, headers=team.mia.headers)).json()["files"].__len__() == 1  # no duplicates
    assert await Notification.find(Notification.user_id == team.hana.user.id, Notification.type == "subfolder_file_added").count() == 1
    assert await Notification.find(Notification.user_id == team.mia.user.id, Notification.type == "subfolder_file_added").count() == 0

    seen_by_head = await client.get(url, headers=team.hana.headers)
    assert [x["name"] for x in seen_by_head.json()["files"]] == ["Budget"]
    assert (await client.get(url, headers=team.ollie.headers)).status_code == 403  # not in this project
    assert (await client.post(url, json={"file_id": f["id"]}, headers=team.ollie.headers)).status_code == 403
    assert (await client.delete(f"{url}/{f['id']}", headers=team.ollie.headers)).status_code == 403

    r = await client.delete(f"{url}/{f['id']}", headers=team.hana.headers)
    assert r.status_code == 200 and r.json()["files"] == []
    assert (await client.delete(f"{url}/{f['id']}", headers=team.hana.headers)).status_code == 404
    assert (await Subfolder.get(team.design.id)).file_ids == []


async def test_only_google_drive_files_can_be_linked_to_a_subfolder(client, team):
    plain = (await client.post("/files/link", json={"title": "x", "url": "https://example.com"}, headers=team.mia.headers)).json()
    r = await client.post(f"/subfolders/{team.design.id}/files", json={"file_id": plain["id"]}, headers=team.mia.headers)
    assert r.status_code == 422


# --- Meet ---------------------------------------------------------------------------------------------------------------
async def book(client, host, booker, title="Design review"):
    a, b = soon(3, 8)
    r = await client.post("/bookings", json={"host_user_id": host.id, "start": iso(a), "end": iso(b), "title": title}, headers=booker.headers)
    assert r.status_code == 201, r.text
    await wait_for_pushes()
    return r.json()["id"]


async def test_a_booking_gets_one_meet_made_on_the_hosts_event_and_the_booker_gets_the_same_link(client, alice, bob, make_user, wg):
    await connect_user(alice)
    await connect_user(bob)
    booking_id = await book(client, alice, bob)

    inserts = wg.of("POST", "/events")
    host_event = next(c for c in inserts if c["json"]["summary"] == "Design review")
    assert host_event["params"]["conferenceDataVersion"] == "1"
    request = host_event["json"]["conferenceData"]["createRequest"]
    assert request["requestId"] == f"tmb-{booking_id}" and request["conferenceSolutionKey"] == {"type": "hangoutsMeet"}

    booking = await Booking.get(booking_id)
    assert booking.meet_url == "https://meet.google.com/abc-defg-001" and booking.meet_owner_id == alice.user.id
    assert wg.meets == 1  # one Meet for the booking, not one per person

    sent = {c["json"]["summary"]: c["json"] for c in wg.of("POST", "/events") + wg.of("PUT", "/events")}
    booker_event = sent["Design review · Alice Employee"]
    assert "conferenceData" not in booker_event
    assert booker_event["location"] == booking.meet_url and booking.meet_url in booker_event["description"]

    # The people in the meeting see the link on the booking; everyone else just sees "Busy".
    day = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    params = {"host_user_id": alice.id, "from": day, "to": day}
    for who in (alice, bob):
        assert (await client.get("/bookings", params=params, headers=who.headers)).json()[0]["meet_url"] == booking.meet_url
    carol = await make_user("employee", "Carol Other")
    seen = (await client.get("/bookings", params=params, headers=carol.headers)).json()[0]
    assert seen["title"] == "Busy" and seen["meet_url"] == ""


async def test_when_only_the_booker_is_connected_their_event_holds_the_meet(client, alice, bob, wg):
    await connect_user(bob)
    booking_id = await book(client, alice, bob)
    booking = await Booking.get(booking_id)
    assert booking.meet_owner_id == bob.user.id and booking.meet_url


async def test_a_google_account_that_cannot_make_meet_links_still_gets_the_booking_event(client, alice, bob, wg):
    await connect_user(alice)
    wg.refuse_meet = True
    booking_id = await book(client, alice, bob)
    posts = wg.of("POST", "/events")
    assert [("conferenceDataVersion" in p["params"], "conferenceData" in p["json"]) for p in posts] == [(True, True), (False, False)]
    assert wg.written["alice@example.com"][f"tmb{booking_id}"]["summary"] == "Design review"
    booking = await Booking.get(booking_id)
    assert booking.meet_url == "" and booking.meet_owner_id is None  # nobody claims a Meet that does not exist


async def test_start_meet_in_chat_makes_a_meet_and_posts_the_link(client, team, wg):
    await connect_user(team.mia)
    g = await group(client, team.mia, team.hana, name="Design chat")
    r = await client.post(f"/chat/groups/{g['id']}/meet", headers=team.mia.headers)
    assert r.status_code == 201, r.text
    assert "https://meet.google.com/abc-defg-001" in r.json()["body"] and "Mia Member started a Google Meet" in r.json()["body"]

    event = wg.of("POST", "/events")[0]
    assert event["params"]["conferenceDataVersion"] == "1"
    assert event["json"]["summary"] == "Design chat: Google Meet"
    assert event["json"]["extendedProperties"]["private"]["tm_source"] == "task-manager"  # the sync never pulls it back in
    msgs = (await client.get(f"/chat/groups/{g['id']}/messages", headers=team.hana.headers)).json()["items"]
    assert any("meet.google.com" in m["body"] for m in msgs)


async def test_start_meet_explains_what_is_missing_and_respects_chat_membership(client, team, wg):
    g = await group(client, team.mia, team.hana)
    d = problem(await client.post(f"/chat/groups/{g['id']}/meet", headers=team.mia.headers))
    assert (d["code"], d["service"]) == ("not_connected", "meet")
    assert (await client.post(f"/chat/groups/{g['id']}/meet", headers=team.ollie.headers)).status_code == 403  # not in the group
    assert (await client.post(f"/chat/groups/{g['id']}/meet", headers=team.cleo.headers)).status_code == 403
    assert len((await client.get(f"/chat/groups/{g['id']}/messages", headers=team.mia.headers)).json()["items"]) == 0


# --- The Drive file browser (our own, over drive.readonly) ----------------------------------------------------------------
def listed(wg) -> dict:
    return wg.of("GET", "/drive/list")[-1]["params"]


async def test_the_browser_lists_my_drive_root_with_folders_first_and_maps_each_file(client, alice, wg):
    await with_drive(alice)
    wg.listing = {
        "nextPageToken": "page-2",
        "files": [
            {"id": "folder0001", "name": "Clients", "mimeType": "application/vnd.google-apps.folder"},
            {"id": DOC_ID, "name": "Brief", "mimeType": "application/vnd.google-apps.document", "thumbnailLink": "https://lh3.googleusercontent.com/t",
             "modifiedTime": "2026-10-01T09:30:00.000Z", "starred": True},
            {"id": "pdf0000001", "name": "Scan.pdf", "mimeType": "application/pdf", "size": "2048"},
        ],
    }
    r = await client.get("/integrations/google/drive/files", headers=alice.headers)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["next_page_token"] == "page-2"
    assert [(i["name"], i["kind"], i["is_folder"]) for i in out["items"]] == [("Clients", "folder", True), ("Brief", "document", False), ("Scan.pdf", "pdf", False)]
    assert out["items"][1]["thumbnail_url"] == "https://lh3.googleusercontent.com/t" and out["items"][1]["starred"] is True and out["items"][2]["size"] == 2048
    p = listed(wg)
    assert p["q"] == "trashed = false and 'root' in parents" and p["orderBy"] == "folder,name_natural"
    assert wg.of("GET", "/drive/list")[-1]["auth"] == "Bearer access-1"


FOLDER_Q = "mimeType = 'application/vnd.google-apps.folder'"


@pytest.mark.parametrize(
    "params,expected",
    [
        ({"view": "my", "parent": "folder0001"}, "trashed = false and 'folder0001' in parents"),
        ({"view": "shared"}, "trashed = false and sharedWithMe = true"),
        ({"view": "starred"}, "trashed = false and starred = true"),
        ({"view": "recent"}, "trashed = false and mimeType != 'application/vnd.google-apps.folder'"),
        ({"view": "my", "kind": "spreadsheet"}, f"trashed = false and ({FOLDER_Q} or mimeType = 'application/vnd.google-apps.spreadsheet') and 'root' in parents"),
        ({"view": "recent", "kind": "document"}, "trashed = false and mimeType != 'application/vnd.google-apps.folder' and mimeType = 'application/vnd.google-apps.document'"),
        ({"view": "my", "q": "o'brien"}, "trashed = false and name contains 'o\\'brien'"),
    ],
)
async def test_each_view_filter_and_search_becomes_the_right_drive_query(client, alice, wg, params, expected):
    await with_drive(alice)
    assert (await client.get("/integrations/google/drive/files", params=params, headers=alice.headers)).status_code == 200
    assert listed(wg)["q"] == expected
    if params.get("view") == "recent":
        assert listed(wg)["orderBy"] == "recency desc"


async def test_the_browser_takes_the_next_page_and_refuses_odd_folder_ids(client, alice, wg):
    await with_drive(alice)
    await client.get("/integrations/google/drive/files", params={"page_token": "page-2"}, headers=alice.headers)
    assert listed(wg)["pageToken"] == "page-2"
    bad = await client.get("/integrations/google/drive/files", params={"parent": "x' or '1'='1"}, headers=alice.headers)
    assert bad.status_code == 422
    assert (await client.get("/integrations/google/drive/files", params={"view": "everything"}, headers=alice.headers)).status_code == 422


async def test_something_browsed_can_be_attached_after_google_confirms_it(client, alice, wg):
    await with_drive(alice)
    wg.drive["sharedDoc001"] = {**wg.drive[DOC_ID], "id": "sharedDoc001", "name": "Shared plan"}
    r = await client.post("/integrations/google/drive/attach", json={"drive_id": "sharedDoc001"}, headers=alice.headers)
    assert r.status_code == 201 and r.json()["name"] == "Shared plan"


# --- Booking guests: invited by Google, with a Meet ----------------------------------------------------------------------
async def book_with(client, host, booker, attendees, title="Kickoff"):
    a, b = soon(3, 8)
    r = await client.post(
        "/bookings", json={"host_user_id": host.id, "start": iso(a), "end": iso(b), "title": title, "attendees": attendees}, headers=booker.headers
    )
    if r.status_code == 201:
        await wait_for_pushes()
    return r


async def test_guests_are_invited_by_google_with_the_meet_on_one_event(client, alice, bob, make_user, wg):
    await connect_user(alice)
    await connect_user(bob)
    dana = await make_user("employee", "Dana Designer")
    r = await book_with(client, alice, bob, [{"user_id": dana.id}, {"email": "Client@Example.org"}])
    assert r.status_code == 201, r.text
    assert sorted(a["email"] for a in r.json()["attendees"]) == ["client@example.org", dana.user.email.lower()]

    posts = wg.of("POST", "/events")
    host_event = next(c for c in posts if c["json"]["summary"] == "Kickoff")
    assert host_event["params"]["sendUpdates"] == "all" and host_event["params"]["conferenceDataVersion"] == "1"
    assert host_event["json"]["attendees"] == [{"email": dana.user.email.lower(), "displayName": "Dana Designer"}, {"email": "client@example.org"}]
    assert host_event["json"]["conferenceData"]["createRequest"]["conferenceSolutionKey"] == {"type": "hangoutsMeet"}
    booker_event = next(c for c in posts + wg.of("PUT", "/events") if c["json"]["summary"].endswith("· Alice Employee"))
    assert "attendees" not in booker_event["json"] and "sendUpdates" not in booker_event["params"]
    assert await Notification.find(Notification.user_id == dana.user.id, Notification.type == "booking_invited").count() == 1


async def test_the_host_and_booker_are_not_invited_to_their_own_booking_and_repeats_collapse(client, alice, bob, wg):
    await connect_user(alice)
    r = await book_with(client, alice, bob, [{"email": alice.user.email}, {"user_id": bob.id}, {"email": "x@example.org"}, {"email": "X@example.org"}])
    assert r.status_code == 201, r.text
    assert [a["email"] for a in r.json()["attendees"]] == ["x@example.org"]


async def test_guests_need_a_connected_google_calendar_to_send_the_invites(client, alice, bob, wg):
    r = await book_with(client, alice, bob, [{"email": "x@example.org"}])
    assert r.status_code == 409 and "Connect Google" in r.json()["detail"]
    assert await Booking.find_all().count() == 0
    assert (await book_with(client, alice, bob, [])).status_code == 201


async def test_guest_input_is_checked(client, alice, bob, client_user, wg):
    await connect_user(alice)
    for bad in ([{"email": "not-an-email"}], [{"email": "a@b.co", "user_id": alice.id}], [{}], [{"email": "a b@c.com"}]):
        assert (await book_with(client, alice, bob, bad)).status_code == 422, bad
    assert (await book_with(client, alice, bob, [{"user_id": client_user.id}])).status_code == 422
    assert (await book_with(client, alice, bob, [{"email": f"p{i}@example.org"} for i in range(21)])).status_code == 422


async def test_clients_cannot_send_invitations_and_strangers_do_not_see_the_guests(client, alice, bob, client_user, make_user, wg):
    await connect_user(alice)
    assert (await book_with(client, alice, client_user, [{"email": "x@example.org"}])).status_code == 403
    await book_with(client, alice, bob, [{"email": "x@example.org"}])
    day = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
    params = {"host_user_id": alice.id, "from": day, "to": day}
    assert (await client.get("/bookings", params=params, headers=bob.headers)).json()[0]["attendees"][0]["email"] == "x@example.org"
    carol = await make_user("employee", "Carol Other")
    assert (await client.get("/bookings", params=params, headers=carol.headers)).json()[0]["attendees"] == []


async def test_cancelling_a_booking_tells_the_guests(client, alice, bob, wg):
    await connect_user(alice)
    r = await book_with(client, alice, bob, [{"email": "x@example.org"}])
    assert (await client.delete(f"/bookings/{r.json()['id']}", headers=alice.headers)).status_code == 204
    await wait_for_pushes()
    deletes = wg.of("DELETE", "/events")
    assert deletes and all(d["params"].get("sendUpdates") == "all" for d in deletes)
