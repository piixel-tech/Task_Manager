"""Gmail-API email: connecting the sender mailbox, sending in the background with retries, the Email log, the template.
Only Google's HTTP endpoints are faked (respx); our API, database and service code are real."""
import base64
import json
from email import message_from_bytes, policy
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from app.core.config import settings
from app.integrations import crypto
from app.models import EmailLog, EmailSender
from app.services import email as mail
from app.services.email_template import link_to, render

TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = mail.SEND_URL


def id_token(address: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"email": address}).encode()).decode().rstrip("=")
    return f"x.{body}.y"


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    monkeypatch.setattr(mail, "RETRY_DELAYS", (0, 0, 0))


@pytest.fixture
def google():
    with respx.mock(assert_all_called=False, assert_all_mocked=True, using="httpcore") as router:
        router.route(host="test").pass_through()
        yield router


async def connected(address="mailbox@piixelco.com") -> EmailSender:
    sender = EmailSender(address=address, refresh_token=crypto.encrypt("refresh-1"))
    await sender.insert()
    return sender


async def test_only_admins_can_use_it(client, admin, alice, client_user):
    for who in (alice, client_user):
        assert (await client.get("/email", headers=who.headers)).status_code == 403
        assert (await client.post("/email/connect", headers=who.headers)).status_code == 403
        assert (await client.post("/email/test", headers=who.headers)).status_code == 403
        assert (await client.get("/email/log", headers=who.headers)).status_code == 403
        assert (await client.delete("/email", headers=who.headers)).status_code == 403
    assert (await client.get("/email")).status_code == 401
    r = await client.get("/email", headers=admin.headers)
    assert r.status_code == 200 and r.json()["sender"] is None and r.json()["configured"] is True
    assert r.json()["redirect_uri"] == "http://localhost:8000/api/v1/email/callback"


async def test_connect_asks_google_only_for_send_and_the_address(client, admin):
    r = await client.post("/email/connect", headers=admin.headers)
    url = urlparse(r.json()["auth_url"])
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert q["client_id"] == "piixel-client-id.apps.googleusercontent.com"
    assert q["redirect_uri"] == settings.EMAIL_REDIRECT_URI
    assert q["access_type"] == "offline" and q["prompt"] == "consent"
    assert sorted(q["scope"].split()) == sorted(["https://www.googleapis.com/auth/gmail.send", "openid", "email"])


async def callback(client, admin, google, **token):
    state = parse_qs(urlparse((await client.post("/email/connect", headers=admin.headers)).json()["auth_url"]).query)["state"][0]
    body = {"access_token": "a", "refresh_token": "refresh-1", "scope": "https://www.googleapis.com/auth/gmail.send openid email", "id_token": id_token("mailbox@piixelco.com"), **token}
    google.post(TOKEN_URL).mock(return_value=httpx.Response(200, json=body))
    return await client.get("/email/callback", params={"code": "c", "state": state})


async def test_callback_saves_the_address_and_an_encrypted_token(client, admin, google):
    r = await callback(client, admin, google)
    assert r.status_code == 303 and "result=connected" in r.headers["location"]
    sender = await EmailSender.find_one()
    assert sender.address == "mailbox@piixelco.com"
    assert "refresh-1" not in sender.refresh_token and crypto.decrypt(sender.refresh_token) == "refresh-1"
    got = (await client.get("/email", headers=admin.headers)).json()["sender"]
    assert got["address"] == "mailbox@piixelco.com" and "refresh_token" not in got


async def test_callback_refuses_a_missing_send_permission_and_bad_state(client, admin, google):
    r = await callback(client, admin, google, scope="openid email")
    assert "result=error" in r.headers["location"] and await EmailSender.find_one() is None
    r = await client.get("/email/callback", params={"code": "c", "state": "forged"})
    assert "result=error" in r.headers["location"]


async def test_disconnect_forgets_the_mailbox(client, admin, google):
    google.post(mail.gclient.REVOKE_URL).mock(return_value=httpx.Response(200))
    assert (await client.delete("/email", headers=admin.headers)).status_code == 404
    await connected()
    assert (await client.delete("/email", headers=admin.headers)).status_code == 204
    assert await EmailSender.find_one() is None


async def test_a_test_email_is_sent_in_the_background_and_logged(client, admin, google):
    await connected()
    google.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600}))
    send = google.post(SEND_URL).mock(return_value=httpx.Response(200, json={"id": "m1"}))
    r = await client.post("/email/test", headers=admin.headers)
    assert r.status_code == 202 and r.json()["status"] == "queued"
    await mail.wait_for_pending()
    row = await EmailLog.find_one()
    assert (row.status, row.attempts, row.to, row.type) == ("sent", 1, admin.user.email, "test")

    request = send.calls.last.request
    assert request.headers["authorization"] == "Bearer tok"
    raw = base64.urlsafe_b64decode(json.loads(request.content)["raw"])
    msg = message_from_bytes(raw, policy=policy.default)
    assert msg["From"] == "Task Manager <mailbox@piixelco.com>" and msg["To"] == admin.user.email
    assert "http://localhost:5173/admin/settings/email" in msg.get_body(("html",)).get_content()

    log = (await client.get("/email/log", headers=admin.headers)).json()
    assert log["total"] == 1 and log["items"][0]["status"] == "sent"


async def test_it_retries_three_times_then_records_the_failure(client, admin, google):
    await connected()
    google.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "tok"}))
    send = google.post(SEND_URL).mock(return_value=httpx.Response(503))
    await client.post("/email/test", headers=admin.headers)
    await mail.wait_for_pending()
    row = await EmailLog.find_one()
    assert (row.status, row.attempts) == ("failed", 4) and "503" in row.error
    assert send.call_count == 4  # the first try and 3 retries


async def test_a_later_try_can_succeed(client, admin, google):
    await connected()
    google.post(TOKEN_URL).mock(return_value=httpx.Response(200, json={"access_token": "tok"}))
    google.post(SEND_URL).mock(side_effect=[httpx.Response(500), httpx.Response(200, json={})])
    await client.post("/email/test", headers=admin.headers)
    await mail.wait_for_pending()
    row = await EmailLog.find_one()
    assert (row.status, row.attempts, row.error) == ("sent", 2, None)


async def test_a_revoked_mailbox_fails_at_once_and_asks_to_reconnect(client, admin, google):
    await connected()
    google.post(TOKEN_URL).mock(return_value=httpx.Response(400, json={"error": "invalid_grant"}))
    await client.post("/email/test", headers=admin.headers)
    await mail.wait_for_pending()
    row = await EmailLog.find_one()
    assert (row.status, row.attempts) == ("failed", 1) and "Reconnect" in row.error
    assert (await client.get("/email", headers=admin.headers)).json()["sender"]["status"] == "needs_reconnect"


async def test_nothing_connected_is_logged_not_raised(admin):
    entry = await mail.send_email("a@b.com", "task_assigned", "Hi", heading="H", text="T", button_label="Open", path="/app/tasks/1")
    await mail.wait_for_pending()
    row = await EmailLog.get(entry.id)
    assert row.status == "failed" and "No sender mailbox" in row.error


async def test_test_email_needs_a_connected_mailbox(client, admin):
    assert (await client.post("/email/test", headers=admin.headers)).status_code == 409


def test_template_has_one_button_built_from_frontend_url_and_escapes_text(monkeypatch):
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://tm.example.com/")
    html, plain = render("Hi <b>", "Line one\nTwo & three", "Open task", "/app/tasks/9")
    assert html.count("<a ") == 1 and 'href="https://tm.example.com/app/tasks/9"' in html
    assert "&lt;b&gt;" in html and "<b>" not in html and "Two &amp; three" in html and "<br>" in html
    assert "#CDBDEB" in html and "max-width:600px" in html and "viewport" in html
    assert "https://tm.example.com/app/tasks/9" in plain
    assert link_to("app/x") == "https://tm.example.com/app/x"
