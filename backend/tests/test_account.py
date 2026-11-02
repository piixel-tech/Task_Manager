"""Phase 10e, the "Me" side: profile, settings and notification preferences, password, and sign-ins (sessions)."""
from beanie import PydanticObjectId

from app.core.security import create_access_token, create_refresh_token
from app.models import Notification, Session
from tests.test_chat import group, live, upload  # noqa: F401  (live is a fixture)
from tests.test_tasks import create, make_task, team  # noqa: F401  (team is a fixture)


def headers(token):
    return {"Authorization": f"Bearer {token}"}


async def sign_in(client, person, password="password123"):
    r = await client.post("/auth/login", json={"email": person.user.email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


async def me(client, who):
    r = await client.get("/auth/me", headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


# --- Settings ---------------------------------------------------------------------------------------------------------------
async def test_removed_theme_falls_back_to_purple(client, team):
    from app.models import User

    u = await User.get(team.mia.id)
    u.settings = {**u.settings, "palette": "beige"}
    await u.save()
    assert (await me(client, team.mia))["settings"]["palette"] == "purple"


async def test_settings_default_and_can_be_saved(client, team):
    s = (await me(client, team.mia))["settings"]
    assert s == {"theme": "system", "palette": "purple", "density": "comfortable", "sound": True, "notif_prefs": {"tasks": True, "reviews": True, "chat": True, "mentions": True, "office": True, "bookings": True}}

    body = {"theme": "dark", "palette": "blue", "density": "compact", "sound": False, "notif_prefs": {**s["notif_prefs"], "office": False}}
    r = await client.put("/me/settings", json=body, headers=team.mia.headers)
    assert r.status_code == 200, r.text
    assert (await me(client, team.mia))["settings"] == body
    assert (await me(client, team.max))["settings"]["theme"] == "system"  # someone else's are untouched

    assert (await client.put("/me/settings", json={**body, "theme": "neon"}, headers=team.mia.headers)).status_code == 422
    assert (await client.put("/me/settings", json={**body, "palette": "neon"}, headers=team.mia.headers)).status_code == 422
    r = await client.put("/me/settings", json={**body, "palette": "green"}, headers=team.mia.headers)
    assert r.status_code == 200 and (await me(client, team.mia))["settings"]["palette"] == "green"
    assert (await client.put("/me/settings", json={**body, "density": "tiny"}, headers=team.mia.headers)).status_code == 422
    assert (await client.put("/me/settings", json=body)).status_code == 401


async def test_switched_off_notifications_are_not_saved_or_pushed(client, team, live):
    prefs = {"tasks": False, "reviews": True, "chat": True, "mentions": True, "office": True, "bookings": True}
    await client.put("/me/settings", json={"theme": "system", "density": "comfortable", "sound": True, "notif_prefs": prefs}, headers=team.mia.headers)
    live.sent.clear()

    await make_task(client, team)  # assigned to Mia, who turned task notifications off
    await make_task(client, team, assignee=team.max)  # Max did not
    assert await Notification.find({"user_id": PydanticObjectId(team.mia.id), "type": "task_assigned"}).count() == 0
    assert await Notification.find({"user_id": PydanticObjectId(team.max.id), "type": "task_assigned"}).count() == 1
    pushed = {str(i) for to, ev, _ in live.sent if ev == "notification" for i in to}
    assert team.mia.id not in pushed and team.max.id in pushed
    assert (await client.get("/notifications/unread-count", headers=team.mia.headers)).json()["count"] == 0


async def test_each_preference_controls_its_own_kind(client, team):
    from app.services.notify import notify

    off = {"tasks": False, "reviews": False, "chat": False, "mentions": False, "office": False, "bookings": False}
    await client.put("/me/settings", json={"theme": "system", "density": "comfortable", "sound": True, "notif_prefs": off}, headers=team.mia.headers)
    uid = [team.mia.user.id]
    for kind in ("task_assigned", "change_request", "review_requested", "chat_group", "client_approval", "mention", "office_post", "booking_created", "subfolder_added", "requirement_added"):
        assert await notify(uid, type=kind, title="x") == [], kind
    # things that are not on the list are never switched off
    for kind in ("birthday", "holiday", "user_created"):
        assert len(await notify(uid, type=kind, title="x")) == 1, kind
    # and one on-switch lets only its own kind through
    await client.put("/me/settings", json={"theme": "system", "density": "comfortable", "sound": True, "notif_prefs": {**off, "mentions": True}}, headers=team.mia.headers)
    assert len(await notify(uid, type="mention", title="x")) == 1
    assert await notify(uid, type="task_assigned", title="x") == []


async def test_a_mention_still_comes_through_when_only_chat_is_off(client, team):
    await client.put(
        "/me/settings",
        json={"theme": "system", "density": "comfortable", "sound": True, "notif_prefs": {"tasks": True, "reviews": True, "chat": False, "mentions": True, "office": True, "bookings": True}},
        headers=team.mia.headers,
    )
    g = await group(client, team.hana, team.mia)
    html = f'<p><span data-type="mention" data-id="{team.mia.id}" data-label="Mia">@Mia</span> hi</p>'
    await client.post(f"/chat/groups/{g['id']}/messages", json={"body": html, "html": True}, headers=team.hana.headers)
    assert await Notification.find({"user_id": PydanticObjectId(team.mia.id), "type": "mention"}).count() == 1
    assert await Notification.find({"user_id": PydanticObjectId(team.mia.id), "type": "chat_group"}).count() == 0  # the "added to group" one was filtered


# --- Profile -------------------------------------------------------------------------------------------------------------------
async def test_profile_can_be_edited(client, team):
    r = await client.patch("/me/profile", json={"name": "  Mia  Member ", "title": "Designer", "phone": "+91 98765", "bio": "Loves type."}, headers=team.mia.headers)
    assert r.status_code == 200, r.text
    p = await me(client, team.mia)
    assert (p["name"], p["title"], p["phone"], p["bio"]) == ("Mia  Member", "Designer", "+91 98765", "Loves type.")
    assert p["email"] == team.mia.user.email and p["role"] == "employee"  # these are an admin's to change
    r = await client.patch("/me/profile", json={"role": "admin", "email": "x@y.z"}, headers=team.mia.headers)
    assert r.status_code == 200 and (await me(client, team.mia))["role"] == "employee"
    assert (await client.patch("/me/profile", json={"name": "   "}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch("/me/profile", json={"bio": "x" * 501}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch("/me/profile", json={"title": "Lead"})).status_code == 401


async def test_photo_must_be_your_own_small_image(client, team):
    photo = await upload(client, team.mia, "me.png", b"png", "image/png")
    url = f"/api/v1/files/{photo['id']}/download"
    r = await client.patch("/me/profile", json={"avatar_url": url}, headers=team.mia.headers)
    assert r.status_code == 200 and (await me(client, team.mia))["avatar_url"] == url

    theirs = await upload(client, team.max, "max.png", b"png", "image/png")
    assert (await client.patch("/me/profile", json={"avatar_url": f"/api/v1/files/{theirs['id']}/download"}, headers=team.mia.headers)).status_code == 422
    doc = await upload(client, team.mia, "cv.pdf", b"pdf", "application/pdf")
    assert (await client.patch("/me/profile", json={"avatar_url": f"/api/v1/files/{doc['id']}/download"}, headers=team.mia.headers)).status_code == 422
    big = await upload(client, team.mia, "big.png", b"x" * (2 * 1024 * 1024 + 1), "image/png")
    assert (await client.patch("/me/profile", json={"avatar_url": f"/api/v1/files/{big['id']}/download"}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch("/me/profile", json={"avatar_url": "https://evil.example/x.png"}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch("/me/profile", json={"avatar_url": "/api/v1/files/not-an-id/download"}, headers=team.mia.headers)).status_code == 422

    assert (await client.patch("/me/profile", json={"avatar_url": "emoji:🚀:#0F3D27"}, headers=team.mia.headers)).status_code == 200  # a preset
    assert (await client.patch("/me/profile", json={"avatar_url": ""}, headers=team.mia.headers)).status_code == 200
    assert (await me(client, team.mia))["avatar_url"] is None


# --- Password -----------------------------------------------------------------------------------------------------------------
async def test_change_password(client, team):
    pw = "password123"
    assert (await client.post("/me/password", json={"current_password": "wrong", "new_password": "brand-new-pw"}, headers=team.mia.headers)).status_code == 400
    assert (await client.post("/me/password", json={"current_password": pw, "new_password": "short"}, headers=team.mia.headers)).status_code == 422
    assert (await client.post("/me/password", json={"current_password": pw, "new_password": pw}, headers=team.mia.headers)).status_code == 422

    assert (await client.post("/me/password", json={"current_password": pw, "new_password": "brand-new-pw"}, headers=team.mia.headers)).status_code == 204
    assert (await client.post("/auth/login", json={"email": team.mia.user.email, "password": pw})).status_code == 401
    assert (await client.post("/auth/login", json={"email": team.mia.user.email, "password": "brand-new-pw"})).status_code == 200


async def test_an_admin_created_account_must_change_its_password(client, team):
    r = await client.post("/users", json={"name": "New Hire", "email": "new@example.com", "password": "temporary-1", "role": "employee"}, headers=team.admin.headers)
    assert r.status_code == 201, r.text
    tokens = await client.post("/auth/login", json={"email": "new@example.com", "password": "temporary-1"})
    h = headers(tokens.json()["access_token"])
    assert (await client.get("/auth/me", headers=h)).json()["must_change_password"] is True
    assert (await client.post("/me/password", json={"current_password": "temporary-1", "new_password": "my-own-secret"}, headers=h)).status_code == 204
    assert (await client.get("/auth/me", headers=h)).json()["must_change_password"] is False


async def test_changing_the_password_signs_other_devices_out_but_not_this_one(client, team):
    this = await sign_in(client, team.mia)
    other = await sign_in(client, team.mia)
    r = await client.post("/me/password", json={"current_password": "password123", "new_password": "brand-new-pw"}, headers=headers(this["access_token"]))
    assert r.status_code == 204
    assert (await client.get("/auth/me", headers=headers(this["access_token"]))).status_code == 200
    assert (await client.get("/auth/me", headers=headers(other["access_token"]))).status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": other["refresh_token"]})).status_code == 401


# --- Sign-ins -----------------------------------------------------------------------------------------------------------------------
async def test_login_starts_a_session_and_logout_ends_it(client, team):
    t = await sign_in(client, team.mia)
    assert await Session.find({"user_id": PydanticObjectId(team.mia.id), "revoked": False}).count() == 1
    assert (await client.get("/auth/me", headers=headers(t["access_token"]))).status_code == 200

    new = (await client.post("/auth/refresh", json={"refresh_token": t["refresh_token"]})).json()
    assert (await client.get("/auth/me", headers=headers(new["access_token"]))).status_code == 200  # same sign-in, fresh tokens
    assert await Session.find_all().count() == 1

    assert (await client.post("/auth/logout", headers=headers(new["access_token"]))).status_code == 204
    for token in (t["access_token"], new["access_token"]):
        assert (await client.get("/auth/me", headers=headers(token))).status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})).status_code == 401
    assert (await client.post("/auth/logout", headers=headers(t["access_token"]))).status_code == 204  # logging out twice is fine
    assert (await client.post("/auth/logout")).status_code == 204


async def test_a_token_for_a_session_that_never_existed_is_refused(client, team):
    fake = create_access_token(team.mia.id, str(PydanticObjectId()))
    assert (await client.get("/auth/me", headers=headers(fake))).status_code == 401
    assert (await client.post("/auth/refresh", json={"refresh_token": create_refresh_token(team.mia.id, str(PydanticObjectId()))})).status_code == 401
    await sign_in(client, team.max)
    sid = (await Session.find_one(Session.user_id == PydanticObjectId(team.max.id))).id
    stolen = create_access_token(team.mia.id, str(sid))  # someone else's session id on my token
    assert (await client.get("/auth/me", headers=headers(stolen))).status_code == 401


async def test_admin_lists_and_ends_sign_ins(client, team, live):
    a, b = await sign_in(client, team.mia), await sign_in(client, team.mia)
    await sign_in(client, team.max)
    r = await client.get("/security/sessions", headers=team.admin.headers)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 3 and {x["user"]["id"] for x in rows} == {team.mia.id, team.max.id}
    assert all({"ip", "user_agent", "created_at", "last_seen_at"} <= set(x) for x in rows)
    mine = (await client.get("/security/sessions", params={"user_id": team.mia.id}, headers=team.admin.headers)).json()
    assert len(mine) == 2

    assert (await client.delete(f"/security/sessions/{mine[0]['id']}", headers=team.admin.headers)).status_code == 200
    statuses = sorted([(await client.get("/auth/me", headers=headers(t["access_token"]))).status_code for t in (a, b)])
    assert statuses == [200, 401]  # exactly one device was signed out
    assert (await client.delete(f"/security/sessions/{mine[0]['id']}", headers=team.admin.headers)).status_code == 404
    assert len((await client.get("/security/sessions", params={"user_id": team.mia.id}, headers=team.admin.headers)).json()) == 1


async def test_force_logout_ends_every_device_including_older_tokens(client, team, live):
    a, b = await sign_in(client, team.mia), await sign_in(client, team.mia)
    r = await client.post(f"/security/users/{team.mia.id}/logout", headers=team.admin.headers)
    assert r.status_code == 200 and r.json() == {"signed_out": 2}
    for t in (a, b):
        assert (await client.get("/auth/me", headers=headers(t["access_token"]))).status_code == 401
    assert (await client.get("/auth/me", headers=team.mia.headers)).status_code == 401  # a token from before sign-ins were tracked
    assert any(ev == "session:revoked" and team.mia.user.id in to for to, ev, _ in live.sent)  # their open app is told at once

    again = await sign_in(client, team.mia)  # signing back in works
    assert (await client.get("/auth/me", headers=headers(again["access_token"]))).status_code == 200
    assert (await client.get("/auth/me", headers=team.max.headers)).status_code == 200  # nobody else is touched
    assert (await client.post(f"/security/users/{PydanticObjectId()}/logout", headers=team.admin.headers)).status_code == 404


async def test_only_admins_see_or_end_sign_ins(client, team):
    t = await sign_in(client, team.mia)
    sid = (await Session.find_one()).id
    for call in (
        client.get("/security/sessions", headers=team.mia.headers),
        client.delete(f"/security/sessions/{sid}", headers=team.mia.headers),
        client.post(f"/security/users/{team.max.id}/logout", headers=team.mia.headers),
        client.get("/security/sessions", headers=team.cleo.headers),
    ):
        assert (await call).status_code == 403
    assert (await client.get("/security/sessions")).status_code == 401
    assert (await client.get("/auth/me", headers=headers(t["access_token"]))).status_code == 200


async def test_a_deactivated_person_cant_use_their_sessions(client, team):
    t = await sign_in(client, team.mia)
    await client.delete(f"/users/{team.mia.id}", headers=team.admin.headers)
    assert (await client.get("/auth/me", headers=headers(t["access_token"]))).status_code == 401


async def test_admin_sets_a_job_role_when_adding_and_editing_a_member(client, team):
    r = await client.post(
        "/users",
        json={"name": "Role Hire", "email": "role@example.com", "password": "temporary-1", "role": "employee", "title": "Video editor"},
        headers=team.admin.headers,
    )
    assert r.status_code == 201 and r.json()["title"] == "Video editor"
    r = await client.patch(f"/users/{r.json()['id']}", json={"title": "Senior editor"}, headers=team.admin.headers)
    assert r.status_code == 200 and r.json()["title"] == "Senior editor"
