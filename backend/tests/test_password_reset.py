"""Forgot password, reset links, the "password changed" email, and the admin's reset link / temporary password."""
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Notification, PasswordReset, ResetAttempt, User
from app.services import email as mail
from app.services import password_reset as pr


@pytest.fixture
def sent(monkeypatch):
    """Every email the app tries to send, as (to, type, kwargs). Nothing goes to Gmail."""
    box: list[tuple[str, str, dict]] = []

    async def fake(to, type, subject, **kw):
        box.append((to, type, {"subject": subject, **kw}))

    monkeypatch.setattr(mail, "send_email", fake)
    return box


def token_of(mail_row) -> str:
    return mail_row[2]["path"].rsplit("/", 1)[1]


async def forgot(client, email):
    return await client.post("/auth/forgot-password", json={"email": email})


async def sign_in(client, person, password="password123"):
    r = await client.post("/auth/login", json={"email": person.user.email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def bearer(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def test_the_answer_is_the_same_whether_or_not_the_account_exists(client, alice, client_user, sent):
    answers = []
    for email in (alice.user.email, "nobody@example.com", client_user.user.email):
        r = await forgot(client, email)
        assert r.status_code == 200
        answers.append(r.json())
    assert answers[0] == answers[1] == answers[2] == {"message": pr.GENERIC_MESSAGE}
    assert [(to, kind) for to, kind, _ in sent] == [(alice.user.email, "password_reset")]  # not the stranger, not the client


async def test_an_inactive_account_gets_no_link(client, alice, sent):
    alice.user.is_active = False
    await alice.user.save()
    assert (await forgot(client, alice.user.email)).json() == {"message": pr.GENERIC_MESSAGE}
    assert sent == []


async def test_the_token_is_stored_hashed_and_lasts_30_minutes(client, alice, sent):
    await forgot(client, alice.user.email.upper())  # addresses are not case sensitive
    token = token_of(sent[0])
    row = await PasswordReset.find_one(PasswordReset.user_id == alice.user.id)
    assert token not in (row.token_hash, str(row.model_dump()))
    assert row.token_hash == pr._hash(token)
    left = row.expires_at.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)
    assert timedelta(minutes=29) < left <= timedelta(minutes=30)
    assert sent[0][2]["button_label"] == "Reset password" and sent[0][2]["path"] == f"/reset-password/{token}"


async def test_a_new_request_cancels_the_old_link(client, alice, sent):
    await forgot(client, alice.user.email)
    await forgot(client, alice.user.email)
    old, new = token_of(sent[0]), token_of(sent[1])
    assert (await client.post("/auth/reset-password/check", json={"token": old})).json() == {"valid": False, "reason": "used"}
    assert (await client.post("/auth/reset-password/check", json={"token": new})).json() == {"valid": True, "reason": None}
    r = await client.post("/auth/reset-password", json={"token": old, "new_password": "brand-new-1"})
    assert r.status_code == 410


async def test_at_most_three_requests_per_address_per_hour_and_it_says_nothing(client, alice, sent):
    for _ in range(5):
        r = await forgot(client, alice.user.email)
        assert r.status_code == 200 and r.json() == {"message": pr.GENERIC_MESSAGE}
    assert len(sent) == 3
    for _ in range(5):  # a stranger is counted the same way, so the limit tells nothing about who exists
        assert (await forgot(client, "ghost@example.com")).json() == {"message": pr.GENERIC_MESSAGE}
    assert await ResetAttempt.find(ResetAttempt.email == "ghost@example.com").count() == 5
    # An hour later it works again.
    await ResetAttempt.find_all().update({"$set": {"created_at": datetime.now(timezone.utc) - timedelta(hours=2)}})
    await forgot(client, alice.user.email)
    assert len(sent) == 4


async def test_link_states_valid_expired_used_and_unknown(client, alice, sent):
    await forgot(client, alice.user.email)
    token = token_of(sent[0])
    check = lambda t: client.post("/auth/reset-password/check", json={"token": t})  # noqa: E731
    assert (await check(token)).json()["valid"] is True
    assert (await check("not-a-real-token")).json() == {"valid": False, "reason": "invalid"}
    await PasswordReset.find_all().update({"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}})
    assert (await check(token)).json() == {"valid": False, "reason": "expired"}
    r = await client.post("/auth/reset-password", json={"token": token, "new_password": "brand-new-1"})
    assert r.status_code == 410
    assert (await client.post("/auth/login", json={"email": alice.user.email, "password": "brand-new-1"})).status_code == 401


async def test_resetting_sets_the_password_signs_everything_out_and_emails_a_notice(client, alice, sent):
    phone, laptop = await sign_in(client, alice), await sign_in(client, alice)
    assert (await client.get("/auth/me", headers=bearer(phone))).status_code == 200
    await forgot(client, alice.user.email)
    token = token_of(sent[0])

    # Weak passwords are refused and the link survives.
    for weak in ("short1", "alllettersnodigit", "12345678901"):
        r = await client.post("/auth/reset-password", json={"token": token, "new_password": weak})
        assert r.status_code == 422, weak
    assert (await client.post("/auth/reset-password", json={"token": token, "new_password": "password123"})).status_code == 422  # same as now
    assert (await client.post("/auth/reset-password/check", json={"token": token})).json()["valid"] is True

    r = await client.post("/auth/reset-password", json={"token": token, "new_password": "brand-new-1"})
    assert r.status_code == 204
    assert (await client.post("/auth/login", json={"email": alice.user.email, "password": "password123"})).status_code == 401
    assert (await client.post("/auth/login", json={"email": alice.user.email, "password": "brand-new-1"})).status_code == 200
    for old in (phone, laptop):
        assert (await client.get("/auth/me", headers=bearer(old))).status_code == 401
    assert (await client.get("/auth/me", headers=alice.headers)).status_code == 401  # older tokens without a sign-in record too

    kinds = [(to, kind) for to, kind, _ in sent]
    assert kinds == [(alice.user.email, "password_reset"), (alice.user.email, "password_changed")]
    assert sent[1][2]["path"] == "/login"

    # One time only.
    again = await client.post("/auth/reset-password", json={"token": token, "new_password": "another-one-2"})
    assert again.status_code == 410
    assert (await client.post("/auth/reset-password/check", json={"token": token})).json() == {"valid": False, "reason": "used"}


async def test_a_reset_clears_must_change_password(client, make_user, sent):
    person = await make_user("employee", "Temp Person", must_change_password=True)
    await forgot(client, person.user.email)
    await client.post("/auth/reset-password", json={"token": token_of(sent[0]), "new_password": "brand-new-1"})
    assert (await User.get(person.user.id)).must_change_password is False


async def test_changing_the_password_in_settings_sends_the_notice_too(client, alice, sent):
    r = await client.post("/me/password", json={"current_password": "password123", "new_password": "brand-new-1"}, headers=alice.headers)
    assert r.status_code == 204
    assert [(to, kind) for to, kind, _ in sent] == [(alice.user.email, "password_changed")]
    assert "Settings" in sent[0][2]["text"]


async def test_changing_the_password_cancels_a_link_emailed_earlier(client, alice, sent):
    await forgot(client, alice.user.email)
    token = token_of(sent[0])
    await client.post("/me/password", json={"current_password": "password123", "new_password": "brand-new-1"}, headers=alice.headers)
    assert (await client.post("/auth/reset-password", json={"token": token, "new_password": "other-pass-2"})).status_code == 410


# --- the admin's side ----------------------------------------------------------------------------------------------------
async def test_an_admin_can_send_a_reset_link(client, admin, alice, client_user, sent):
    assert (await client.post(f"/users/{alice.id}/send-reset-link", headers=alice.headers)).status_code == 403
    assert (await client.post(f"/users/{alice.id}/send-reset-link")).status_code == 401
    assert (await client.post(f"/users/{client_user.id}/send-reset-link", headers=admin.headers)).status_code == 422
    assert (await client.post(f"/users/{admin.id}/send-reset-link", headers=admin.headers)).status_code == 400
    assert sent == []

    assert (await client.post(f"/users/{alice.id}/send-reset-link", headers=admin.headers)).status_code == 204
    assert [(to, kind) for to, kind, _ in sent] == [(alice.user.email, "password_reset")]
    assert "administrator" in sent[0][2]["text"]
    token = token_of(sent[0])
    assert (await client.post("/auth/reset-password", json={"token": token, "new_password": "brand-new-1"})).status_code == 204


async def test_an_admin_can_set_a_temporary_password_that_must_be_changed(client, admin, alice, client_user, sent):
    body = {"password": "temp-pass-1"}
    assert (await client.post(f"/users/{alice.id}/temporary-password", json=body, headers=alice.headers)).status_code == 403
    assert (await client.post(f"/users/{client_user.id}/temporary-password", json=body, headers=admin.headers)).status_code == 422
    assert (await client.post(f"/users/{alice.id}/temporary-password", json={"password": "weak"}, headers=admin.headers)).status_code == 422
    phone = await sign_in(client, alice)

    assert (await client.post(f"/users/{alice.id}/temporary-password", json=body, headers=admin.headers)).status_code == 204
    assert (await client.get("/auth/me", headers=bearer(phone))).status_code == 401  # signed out everywhere
    assert (await client.post("/auth/login", json={"email": alice.user.email, "password": "password123"})).status_code == 401
    tokens = await sign_in(client, alice, "temp-pass-1")
    assert (await client.get("/auth/me", headers=bearer(tokens))).json()["must_change_password"] is True

    assert [(to, kind) for to, kind, _ in sent] == [(alice.user.email, "password_changed")]
    assert "temp-pass-1" not in str(sent)  # the password is never emailed
    told = await Notification.find(Notification.user_id == alice.user.id, Notification.type == "password_changed").count()
    assert told == 1

    # They choose their own with the existing first-sign-in flow.
    r = await client.post("/me/password", json={"current_password": "temp-pass-1", "new_password": "my-own-secret1"}, headers=bearer(tokens))
    assert r.status_code == 204
    assert (await client.get("/auth/me", headers=bearer(tokens))).json()["must_change_password"] is False
