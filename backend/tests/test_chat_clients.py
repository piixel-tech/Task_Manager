from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId

from app.models import ClientApproval, File, Invite, Notification, Project
from app.models.chat import ChatGroup, ChatMessage
from app.services.approvals import run_approval_reminders
from tests.test_chat import group, groups, live, msgs, sent, upload  # noqa: F401  (live is a fixture)
from tests.test_tasks import team  # noqa: F401  (team is a fixture)


def now():
    return datetime.now(timezone.utc)


async def make_invite(client, who, g):
    r = await client.post(f"/chat/groups/{g['id']}/invites", headers=who.headers)
    assert r.status_code == 201, r.text
    return r.json()


async def join(client, who, token):
    return await client.post(f"/invites/{token}/join", headers=who.headers)


async def design_group(client, team, *extra):
    """A group linked to the Design subfolder (head: Hana), with Mia in it."""
    return await group(client, team.hana, team.mia, *extra, name="Acme design", subfolder_id=str(team.design.id))


# --- Making, listing and revoking links ------------------------------------------------------------------------------
async def test_heads_of_the_linked_subfolder_and_admins_make_invite_links(client, team, live):
    g = await design_group(client, team, team.admin)
    r = await client.post(f"/chat/groups/{g['id']}/invites", headers=team.hana.headers)
    assert r.status_code == 201, r.text
    inv = r.json()
    assert len(inv["token"]) >= 24 and inv["group_id"] == g["id"] and inv["used_count"] == 0 and inv["created_by"]["id"] == team.hana.id
    left = datetime.fromisoformat(inv["expires_at"]) - now()
    assert timedelta(days=6, hours=23) < left <= timedelta(days=7)  # 7 days
    assert (await make_invite(client, team.admin, g))["token"] != inv["token"]  # admin in the group may too
    assert (await groups(client, team.hana))["Acme design"]["can_invite"] is True
    assert (await groups(client, team.mia))["Acme design"]["can_invite"] is False

    for who in (team.mia, team.vic, team.ollie, team.cleo):  # plain member / not in group / client
        assert (await client.post(f"/chat/groups/{g['id']}/invites", headers=who.headers)).status_code == 403, who
    assert (await client.post(f"/chat/groups/{g['id']}/invites")).status_code == 401
    assert (await client.post(f"/chat/groups/{team.design.id}/invites", headers=team.hana.headers)).status_code == 404

    plain = await group(client, team.hana, team.mia, name="No subfolder")
    assert (await client.post(f"/chat/groups/{plain['id']}/invites", headers=team.hana.headers)).status_code == 403  # a head of nothing here
    assert (await groups(client, team.hana))["No subfolder"]["can_invite"] is False
    assert (await client.post(f"/chat/groups/{plain['id']}/invites", headers=team.admin.headers)).status_code == 403  # not in that group


async def test_a_head_of_another_subfolder_cannot_invite_into_this_group(client, team, live):
    g = await group(client, team.vic, team.hana, name="Video chat", subfolder_id=str(team.video.id))
    assert (await client.post(f"/chat/groups/{g['id']}/invites", headers=team.hana.headers)).status_code == 403  # Hana heads Design, not Video
    assert (await client.post(f"/chat/groups/{g['id']}/invites", headers=team.vic.headers)).status_code == 201


async def test_list_shows_only_working_links_and_revoke_kills_one(client, team, live):
    g = await design_group(client, team)
    a = await make_invite(client, team.hana, g)
    b = await make_invite(client, team.hana, g)
    old = await make_invite(client, team.hana, g)
    await Invite.find({"_id": PydanticObjectId(old["id"])}).update({"$set": {"expires_at": now() - timedelta(minutes=1)}})
    url = f"/chat/groups/{g['id']}/invites"
    assert {i["id"] for i in (await client.get(url, headers=team.hana.headers)).json()} == {a["id"], b["id"]}  # expired one is gone
    assert (await client.get(url, headers=team.mia.headers)).status_code == 403

    assert (await client.delete(f"/chat/invites/{a['id']}", headers=team.mia.headers)).status_code == 403
    assert (await client.delete(f"/chat/invites/{a['id']}")).status_code == 401
    assert (await client.delete(f"/chat/invites/{a['id']}", headers=team.hana.headers)).status_code == 204
    assert (await client.delete(f"/chat/invites/{a['id']}", headers=team.hana.headers)).status_code == 204  # idempotent
    assert (await client.delete(f"/chat/invites/{g['id']}", headers=team.hana.headers)).status_code == 404
    assert [i["id"] for i in (await client.get(url, headers=team.hana.headers)).json()] == [b["id"]]
    assert (await client.get(f"/invites/{a['token']}")).status_code == 410  # the link itself is dead


# --- The public join page ---------------------------------------------------------------------------------------------
async def test_preview_works_without_logging_in_and_rejects_bad_links(client, team, live):
    g = await design_group(client, team)
    inv = await make_invite(client, team.hana, g)
    r = await client.get(f"/invites/{inv['token']}")  # no auth header
    assert r.status_code == 200
    assert r.json()["group_name"] == "Acme design" and r.json()["invited_by"] == "Hana Head" and r.json()["project_name"] == "Acme"
    assert set(r.json()) == {"group_name", "invited_by", "project_name", "expires_at"}  # nothing else leaks
    assert (await client.get("/invites/not-a-real-token")).status_code == 404

    await Invite.find_all().update({"$set": {"expires_at": now() - timedelta(seconds=5)}})
    r = await client.get(f"/invites/{inv['token']}")
    assert r.status_code == 410 and "expired" in r.json()["detail"]
    await Invite.find_all().update({"$set": {"expires_at": now() + timedelta(days=1), "revoked": True}})
    assert "revoked" in (await client.get(f"/invites/{inv['token']}")).json()["detail"]
    await Invite.find_all().update({"$set": {"revoked": False}})
    await ChatGroup.find_all().delete()
    assert (await client.get(f"/invites/{inv['token']}")).status_code == 410


async def test_a_new_client_signs_up_and_lands_in_the_group_and_on_the_project(client, team, live):
    g = await design_group(client, team)
    inv = await make_invite(client, team.hana, g)
    await Notification.find_all().delete()
    body = {"name": "  Nina   Client ", "email": "Nina@Example.com", "password": "s3cret-pass"}
    r = await client.post(f"/invites/{inv['token']}/signup", json=body)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["group_id"] == g["id"] and out["access_token"] and out["refresh_token"]
    assert "password" not in r.text and "password_hash" not in r.text

    headers = {"Authorization": f"Bearer {out['access_token']}"}
    me = (await client.get("/auth/me", headers=headers)).json()
    assert me["role"] == "client" and me["name"] == "Nina Client" and me["email"] == "nina@example.com" and "password_hash" not in me
    assert me["company_id"] == str(team.project.company_id)  # same company as the project
    assert (await client.post("/auth/login", json={"email": "nina@example.com", "password": "s3cret-pass"})).status_code == 200

    stored = await ChatGroup.get(g["id"])
    assert [str(c) for c in stored.client_ids] == [me["id"]]
    assert me["id"] in {str(c) for c in (await Project.get(team.project.id)).client_ids}  # on the project too
    mine = await client.get("/chat/groups", headers=headers)
    assert [x["name"] for x in mine.json()] == ["Acme design"]
    assert me["id"] in {m["id"] for m in mine.json()[0]["members"]}

    notes = await Notification.find(Notification.type == "chat_client_joined").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.mia.user.id}  # the team hears; the client doesn't
    assert "Nina Client" in notes[0].title and notes[0].link.endswith(f"/chat?group={g['id']}")
    assert (await Invite.get(inv["id"])).used_by and (await client.get(f"/chat/groups/{g['id']}/invites", headers=team.hana.headers)).json()[0]["used_count"] == 1


async def test_signup_rules(client, team, live):
    g = await design_group(client, team)
    inv = await make_invite(client, team.hana, g)
    url = f"/invites/{inv['token']}/signup"
    for body in ({}, {"name": "", "email": "a@b.co", "password": "longenough"}, {"name": "   ", "email": "a@b.co", "password": "longenough"},
                 {"name": "A", "email": "not-an-email", "password": "longenough"}, {"name": "A", "email": "a@b.co", "password": "short"}):
        assert (await client.post(url, json=body)).status_code == 422, body
    ok = {"name": "A", "email": "a@b.co", "password": "longenough"}
    assert (await client.post(url, json=ok)).status_code == 201
    r = await client.post(url, json=ok)  # same email again
    assert r.status_code == 409 and "Log in" in r.json()["detail"]
    r = await client.post(url, json={**ok, "email": team.mia.user.email})  # an existing team account
    assert r.status_code == 409
    assert (await client.post("/invites/nope/signup", json=ok)).status_code == 404
    await Invite.find_all().update({"$set": {"revoked": True}})
    assert (await client.post(url, json={**ok, "email": "c@d.co"})).status_code == 410
    assert await ChatGroup.find(ChatGroup.name == "Acme design").count() == 1


async def test_an_existing_client_joins_once_and_a_link_serves_many_clients(client, team, make_user, live):
    g = await design_group(client, team)
    inv = await make_invite(client, team.hana, g)
    second = await make_user("client", "Cleo Two")
    await Notification.find_all().delete()
    r = await join(client, team.cleo, inv["token"])
    assert r.status_code == 200 and r.json() == {"group_id": g["id"]}
    assert await Notification.find(Notification.type == "chat_client_joined").count() == 2
    await Notification.find_all().delete()
    assert (await join(client, team.cleo, inv["token"])).status_code == 200  # again: no change, no new notice
    assert await Notification.find_all().count() == 0
    assert (await join(client, second, inv["token"])).status_code == 200
    stored = await ChatGroup.get(g["id"])
    assert {str(c) for c in stored.client_ids} == {team.cleo.id, second.id}
    assert (await client.get(f"/chat/groups/{g['id']}/invites", headers=team.hana.headers)).json()[0]["used_count"] == 2
    project = await Project.get(team.project.id)
    assert {str(c) for c in project.client_ids} == {team.cleo.id, second.id}


async def test_only_clients_use_links_and_login_is_required(client, team, live):
    g = await design_group(client, team)
    inv = await make_invite(client, team.hana, g)
    for who in (team.vic, team.admin, team.ollie):
        r = await join(client, who, inv["token"])
        assert r.status_code == 403, who
    assert (await client.post(f"/invites/{inv['token']}/join")).status_code == 401
    assert (await join(client, team.cleo, "nope")).status_code == 404
    await Invite.find_all().update({"$set": {"revoked": True}})
    assert (await join(client, team.cleo, inv["token"])).status_code == 410
    assert (await ChatGroup.get(g["id"])).client_ids == []


async def test_joining_an_unlinked_group_leaves_projects_alone(client, team, live):
    g = await group(client, team.admin, team.hana, name="Admin room")
    inv = await make_invite(client, team.admin, g)
    assert (await join(client, team.cleo, inv["token"])).status_code == 200
    assert (await Project.get(team.project.id)).client_ids == []


# --- What clients can and can't do in chat -------------------------------------------------------------------------
async def test_clients_see_only_the_groups_they_joined(client, team, live):
    mine = await design_group(client, team)
    other = await group(client, team.hana, team.mia, name="Internal only")
    await join(client, team.cleo, (await make_invite(client, team.hana, mine))["token"])
    await sent(client, team.hana, other, "budget talk")
    await sent(client, team.hana, mine, "welcome Cleo")

    assert set(await groups(client, team.cleo)) == {"Acme design"}
    g = (await groups(client, team.cleo))["Acme design"]
    assert g["unread_count"] == 1 and g["can_manage"] is False and g["can_invite"] is False
    assert {m["id"] for m in g["members"]} == {team.hana.id, team.mia.id, team.cleo.id}
    assert next(m for m in g["members"] if m["id"] == team.cleo.id)["role"] == "client"

    for url, method in ((f"/chat/groups/{other['id']}", "get"), (f"/chat/groups/{other['id']}/messages", "get")):
        assert (await getattr(client, method)(url, headers=team.cleo.headers)).status_code == 403
    assert (await client.post(f"/chat/groups/{other['id']}/messages", json={"body": "hi"}, headers=team.cleo.headers)).status_code == 403
    assert (await client.get("/chat/unread", headers=team.cleo.headers)).json() == {"total": 1, "by_group": {mine["id"]: 1}}
    assert [m["body"] for m in (await msgs(client, team.cleo, mine))["items"]] == ["welcome Cleo"]


async def test_clients_chat_but_cannot_create_invite_or_manage(client, team, make_user, live):
    g = await design_group(client, team)
    await join(client, team.cleo, (await make_invite(client, team.hana, g))["token"])
    assert (await client.post("/chat/groups", json={"name": "Mine"}, headers=team.cleo.headers)).status_code == 403
    assert (await client.post(f"/chat/groups/{g['id']}/members", json={"user_ids": [team.max.id]}, headers=team.cleo.headers)).status_code == 403
    assert (await client.post(f"/chat/groups/{g['id']}/invites", headers=team.cleo.headers)).status_code == 403
    assert (await client.patch(f"/chat/groups/{g['id']}", json={"name": "Hijack"}, headers=team.cleo.headers)).status_code == 403
    assert (await client.delete(f"/chat/groups/{g['id']}", headers=team.cleo.headers)).status_code == 403
    assert (await client.delete(f"/chat/groups/{g['id']}/members/{team.mia.id}", headers=team.cleo.headers)).status_code == 403

    live.sent.clear()
    m = await sent(client, team.cleo, g, "Looks good so far")  # but she can talk
    assert m["sender"]["role"] == "client"
    (to, data), = live.events("chat:message")
    assert to == {team.hana.user.id, team.mia.user.id, team.cleo.user.id}
    await client.put(f"/chat/messages/{m['id']}/reactions", json={"emoji": "👍"}, headers=team.mia.headers)
    assert (await client.post(f"/chat/groups/{g['id']}/read", headers=team.cleo.headers)).status_code == 200
    f = await upload(client, team.cleo, "logo.png", b"png", "image/png")
    assert (await sent(client, team.cleo, g, "", type="image", file_id=f["id"]))["type"] == "image"
    assert (await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.cleo.headers)).status_code == 204


async def test_ticks_count_clients_as_recipients(client, team, live):
    g = await design_group(client, team)
    await join(client, team.cleo, (await make_invite(client, team.hana, g))["token"])
    await sent(client, team.hana, g, "update")
    await client.post(f"/chat/groups/{g['id']}/read", headers=team.mia.headers)
    assert (await msgs(client, team.hana, g))["items"][0]["status"] == "sent"  # Cleo hasn't read it yet
    await client.post(f"/chat/groups/{g['id']}/read", headers=team.cleo.headers)
    item = (await msgs(client, team.hana, g))["items"][0]
    assert item["status"] == "seen" and {r["user_id"] for r in item["seen_by"]} == {team.mia.id, team.cleo.id}


async def test_a_client_can_leave_and_the_creator_can_remove_one(client, team, make_user, live):
    g = await design_group(client, team)
    inv = await make_invite(client, team.hana, g)
    other = await make_user("client", "Cleo Two")
    await join(client, team.cleo, inv["token"])
    await join(client, other, inv["token"])
    assert (await client.delete(f"/chat/groups/{g['id']}/members/{team.cleo.id}", headers=team.cleo.headers)).status_code == 200  # leaves
    assert (await client.get(f"/chat/groups/{g['id']}", headers=team.cleo.headers)).status_code == 403
    r = await client.delete(f"/chat/groups/{g['id']}/members/{other.id}", headers=team.hana.headers)  # removed by the creator
    assert r.status_code == 200 and (await ChatGroup.get(g["id"])).client_ids == []
    assert (await groups(client, other)) == {}


# --- Approval cards ----------------------------------------------------------------------------------------------------
async def client_group(client, team, live, name="Acme design"):
    g = await group(client, team.hana, team.mia, team.max, team.admin, name=name, subfolder_id=str(team.design.id))
    await join(client, team.cleo, (await make_invite(client, team.hana, g))["token"])
    return g


async def ask(client, who, g, question="Is the new logo OK?", **extra):
    return await client.post(f"/chat/groups/{g['id']}/approvals", json={"question": question, **extra}, headers=who.headers)


async def test_any_team_member_sends_an_approval_card_with_custom_buttons(client, team, live):
    g = await client_group(client, team, live)
    f = await upload(client, team.mia, "logo-v2.png", b"png", "image/png")
    await Notification.find_all().delete()
    live.sent.clear()
    r = await ask(client, team.mia, g, "  Is the new   logo OK? ", file_ids=[f["id"]], approve_label="Looks great", reject_label="Needs work")
    assert r.status_code == 201, r.text
    m = r.json()
    a = m["approval"]
    assert m["type"] == "approval" and m["sender"]["id"] == team.mia.id and m["reminder"] is False
    assert (a["question"], a["approve_label"], a["reject_label"], a["status"]) == ("Is the new logo OK?", "Looks great", "Needs work", "pending")
    assert [x["name"] for x in a["files"]] == ["logo-v2.png"] and a["reason"] is None and a["answered_by"] is None and a["next_reminder_at"]

    default = (await ask(client, team.max, g, "Second one")).json()["approval"]
    assert (default["approve_label"], default["reject_label"]) == ("Approve", "Reject")

    (to, data), = [e for e in live.events("chat:message") if e[1]["approval"]["question"] == "Is the new logo OK?"]
    assert to == {team.hana.user.id, team.mia.user.id, team.max.user.id, team.admin.user.id, team.cleo.user.id}  # everyone sees the card live
    notes = await Notification.find(Notification.type == "client_approval").to_list()
    assert {n.user_id for n in notes} == {team.cleo.user.id}  # only the client is pinged
    assert notes[0].link == f"/client/portal?group={g['id']}" and "logo" in notes[0].body

    shown = (await msgs(client, team.cleo, g))["items"]
    assert [x["approval"]["question"] for x in shown] == ["Is the new logo OK?", "Second one"]
    assert (await groups(client, team.cleo))["Acme design"]["last_message"]["preview"] == "✅ Approval: Second one"


async def test_approval_request_rules(client, team, live):
    g = await client_group(client, team, live)
    lonely = await group(client, team.hana, team.mia, name="No client yet")
    assert (await ask(client, team.hana, lonely)).status_code == 409  # nobody to ask
    assert (await ask(client, team.cleo, g)).status_code == 403  # clients answer, they don't ask
    assert (await ask(client, team.vic, g)).status_code == 403  # not in the group
    assert (await ask(client, team.admin, g)).status_code == 201  # admin in the group
    assert (await client.post(f"/chat/groups/{g['id']}/approvals", json={"question": "x"})).status_code == 401
    theirs = await upload(client, team.hana, "h.png", b"png", "image/png")
    for body in ({}, {"question": ""}, {"question": "   "}, {"question": "x" * 1001}, {"question": "x", "approve_label": ""},
                 {"question": "x", "reject_label": "y" * 31}, {"question": "x", "file_ids": [theirs["id"]]},  # someone else's file
                 {"question": "x", "file_ids": [str(g["id"])] * 11}, {"question": "x", "file_ids": ["nope"]}):
        r = await client.post(f"/chat/groups/{g['id']}/approvals", json=body, headers=team.mia.headers)
        assert r.status_code == 422, body
    # a card can't be faked through the normal message endpoint, or forwarded
    assert (await client.post(f"/chat/groups/{g['id']}/messages", json={"type": "approval", "body": "x"}, headers=team.mia.headers)).status_code == 422
    card = (await msgs(client, team.mia, g))["items"][0]
    other = await group(client, team.mia, team.max, name="Other")
    assert (await client.post(f"/chat/messages/{card['id']}/forward", json={"group_ids": [other["id"]]}, headers=team.mia.headers)).status_code == 409


# --- Answering ------------------------------------------------------------------------------------------------------------
async def answer(client, who, approval_id, decision="approved", **extra):
    return await client.post(f"/chat/approvals/{approval_id}/answer", json={"decision": decision, **extra}, headers=who.headers)


async def test_a_client_approves_and_everyone_sees_it_live(client, team, live):
    g = await client_group(client, team, live)
    card = (await ask(client, team.mia, g, approve_label="Looks great")).json()
    aid = card["approval"]["id"]
    await Notification.find_all().delete()
    live.sent.clear()
    r = await answer(client, team.cleo, aid, reason="ignored on approval")
    assert r.status_code == 200, r.text
    a = r.json()["approval"]
    assert a["status"] == "approved" and a["reason"] is None and a["answered_by"]["id"] == team.cleo.id and a["answered_at"] and a["next_reminder_at"] is None

    (to, data), = live.events("chat:message_update")
    assert data["approval"]["status"] == "approved" and to == {team.hana.user.id, team.mia.user.id, team.max.user.id, team.admin.user.id, team.cleo.user.id}
    notes = await Notification.find(Notification.type == "approval_answered").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.mia.user.id, team.max.user.id, team.admin.user.id}  # the team, not the client
    assert "Approved" in notes[0].title and "Looks great" in notes[0].body and "Cleo Client" in notes[0].body
    assert (await msgs(client, team.mia, g))["items"][0]["approval"]["status"] == "approved"


async def test_rejecting_needs_a_reason_and_the_reason_is_shown(client, team, live):
    g = await client_group(client, team, live)
    aid = (await ask(client, team.mia, g, reject_label="Needs work")).json()["approval"]["id"]
    for body in ({"decision": "rejected"}, {"decision": "rejected", "reason": ""}, {"decision": "rejected", "reason": "   "},
                 {"decision": "rejected", "reason": "x" * 1001}, {"decision": "maybe"}, {}):
        assert (await client.post(f"/chat/approvals/{aid}/answer", json=body, headers=team.cleo.headers)).status_code == 422, body
    assert (await msgs(client, team.cleo, g))["items"][0]["approval"]["status"] == "pending"  # nothing changed
    await Notification.find_all().delete()
    r = await answer(client, team.cleo, aid, "rejected", reason="  The blue is too dark  ")
    a = r.json()["approval"]
    assert a["status"] == "rejected" and a["reason"] == "The blue is too dark" and a["answered_by"]["id"] == team.cleo.id
    notes = await Notification.find(Notification.type == "approval_answered").to_list()
    assert "Rejected" in notes[0].title and "Needs work" in notes[0].body and "The blue is too dark" in notes[0].body


async def test_only_clients_in_the_group_answer_and_only_once(client, team, make_user, live):
    g = await client_group(client, team, live)
    aid = (await ask(client, team.mia, g)).json()["approval"]["id"]
    outsider = await make_user("client", "Outside Client")
    for who in (team.hana, team.mia, team.admin, team.vic, outsider):  # staff, even the head; clients not in the group
        assert (await answer(client, who, aid)).status_code == 403, who
    assert (await client.post(f"/chat/approvals/{aid}/answer", json={"decision": "approved"})).status_code == 401
    assert (await answer(client, team.cleo, str(g["id"]))).status_code == 404
    assert (await answer(client, team.cleo, aid)).status_code == 200
    r = await answer(client, team.cleo, aid, "rejected", reason="changed my mind")
    assert r.status_code == 409 and "approved" in r.json()["detail"]
    assert (await ClientApproval.get(aid)).status == "approved"


async def test_with_two_clients_the_first_answer_wins(client, team, make_user, live):
    g = await client_group(client, team, live)
    second = await make_user("client", "Cleo Two")
    await join(client, second, (await make_invite(client, team.hana, g))["token"])
    aid = (await ask(client, team.mia, g)).json()["approval"]["id"]
    assert (await answer(client, second, aid, "rejected", reason="no")).status_code == 200
    r = await answer(client, team.cleo, aid)
    assert r.status_code == 409
    a = (await msgs(client, team.mia, g))["items"][0]["approval"]
    assert a["status"] == "rejected" and a["answered_by"]["id"] == second.id


async def test_pending_approvals_list_for_the_client_portal(client, team, live):
    g = await client_group(client, team, live)
    await group(client, team.hana, team.mia, name="Internal")  # a group the client is not in
    one = (await ask(client, team.mia, g, "First?")).json()["approval"]["id"]
    await ask(client, team.mia, g, "Second?")
    await answer(client, team.cleo, one)
    r = await client.get("/chat/approvals", headers=team.cleo.headers)
    assert r.status_code == 200
    items = r.json()
    assert [i["approval"]["question"] for i in items] == ["Second?"] and items[0]["group_name"] == "Acme design" and items[0]["group_id"] == g["id"]
    assert items[0]["message_id"]
    assert {i["approval"]["question"] for i in (await client.get("/chat/approvals", params={"status": "all"}, headers=team.cleo.headers)).json()} == {"First?", "Second?"}
    assert len((await client.get("/chat/approvals", headers=team.mia.headers)).json()) == 1  # staff see their groups' too
    assert (await client.get("/chat/approvals", headers=team.vic.headers)).json() == []  # not in any group
    assert (await client.get("/chat/approvals", params={"status": "weird"}, headers=team.cleo.headers)).status_code == 422
    assert (await client.get("/chat/approvals")).status_code == 401


async def test_deleting_the_card_for_everyone_withdraws_the_question(client, team, live):
    g = await client_group(client, team, live)
    card = (await ask(client, team.mia, g)).json()
    assert (await client.delete(f"/chat/messages/{card['id']}", params={"scope": "everyone"}, headers=team.hana.headers)).status_code == 403  # sender only
    assert (await client.delete(f"/chat/messages/{card['id']}", params={"scope": "everyone"}, headers=team.mia.headers)).status_code == 204
    assert (await ClientApproval.get(card["approval"]["id"])).status == "cancelled"
    assert (await answer(client, team.cleo, card["approval"]["id"])).status_code == 409
    assert (await client.get("/chat/approvals", headers=team.cleo.headers)).json() == []
    assert await run_approval_reminders(now=now() + timedelta(days=3)) == 0


# --- Reminders -------------------------------------------------------------------------------------------------------------
async def test_a_pending_approval_reminds_the_client_every_24_hours_and_reposts_the_card(client, team, live):
    g = await client_group(client, team, live)
    card = (await ask(client, team.mia, g, "Is the logo OK?")).json()
    aid = card["approval"]["id"]
    start = now()

    assert await run_approval_reminders(now=start + timedelta(hours=23)) == 0  # not due yet
    await Notification.find_all().delete()
    live.sent.clear()
    assert await run_approval_reminders(now=start + timedelta(hours=25)) == 1

    notes = await Notification.find_all().to_list()
    assert [n.user_id for n in notes] == [team.cleo.user.id] and notes[0].type == "approval_reminder"  # the client only
    assert notes[0].link == f"/client/portal?group={g['id']}" and "Is the logo OK?" in notes[0].body
    assert {n.user_id for n in notes}.isdisjoint({team.admin.user.id, team.hana.user.id})  # no escalation

    items = (await msgs(client, team.cleo, g))["items"]
    assert [i["type"] for i in items] == ["approval", "approval"] and [i["reminder"] for i in items] == [False, True]
    repost = items[1]
    assert repost["sender"]["id"] == team.mia.id and repost["approval"]["id"] == aid and repost["approval"]["status"] == "pending"
    assert live.events("chat:message")[0][1]["reminder"] is True  # pushed live to the group
    assert (await groups(client, team.cleo))["Acme design"]["last_message"]["preview"] == "⏰ Reminder: Is the logo OK?"

    stored = await ClientApproval.get(aid)
    assert stored.reminders_sent == 1 and abs((stored.next_reminder_at.replace(tzinfo=timezone.utc) - (start + timedelta(hours=25))) - timedelta(hours=24)) < timedelta(seconds=1)

    assert await run_approval_reminders(now=start + timedelta(hours=25)) == 0  # same moment again: already done
    assert await run_approval_reminders(now=start + timedelta(hours=48)) == 0  # 23 hours after the last one
    assert await run_approval_reminders(now=start + timedelta(hours=50)) == 1  # and 24+ hours later: the next
    assert (await ClientApproval.get(aid)).reminders_sent == 2


async def test_answering_stops_reminders_and_updates_every_copy_of_the_card(client, team, live):
    g = await client_group(client, team, live)
    aid = (await ask(client, team.mia, g)).json()["approval"]["id"]
    await run_approval_reminders(force=True)
    live.sent.clear()
    await answer(client, team.cleo, aid, "rejected", reason="Not yet")
    assert len(live.events("chat:message_update")) == 2  # the card and its reminder
    assert [i["approval"]["status"] for i in (await msgs(client, team.mia, g))["items"]] == ["rejected", "rejected"]
    await Notification.find_all().delete()
    assert await run_approval_reminders(now=now() + timedelta(days=10)) == 0
    assert await Notification.find_all().count() == 0
    assert await ChatMessage.find(ChatMessage.reminder == True).count() == 1  # noqa: E712


async def test_no_reminder_when_nobody_is_there_to_receive_it(client, team, live):
    g = await client_group(client, team, live)
    aid = (await ask(client, team.mia, g)).json()["approval"]["id"]
    await client.delete(f"/chat/groups/{g['id']}/members/{team.cleo.id}", headers=team.cleo.headers)  # the client leaves
    await Notification.find_all().delete()
    assert await run_approval_reminders(now=now() + timedelta(days=2)) == 0
    assert await Notification.find_all().count() == 0 and await ChatMessage.find(ChatMessage.reminder == True).count() == 0  # noqa: E712
    assert (await ClientApproval.get(aid)).status == "pending"  # still waiting; checked again later
    await ChatGroup.find_all().delete()
    assert await run_approval_reminders(now=now() + timedelta(days=5)) == 0  # group gone: cancelled, no crash
    assert (await ClientApproval.get(aid)).status == "cancelled"


async def test_the_dev_endpoint_runs_the_job_now(client, team, live):
    g = await client_group(client, team, live)
    await ask(client, team.mia, g)
    url = "/chat/approvals/reminders/run"
    assert (await client.post(url, headers=team.mia.headers)).status_code == 403  # admins only
    assert (await client.post(url, headers=team.cleo.headers)).status_code == 403
    assert (await client.post(url)).status_code == 401
    assert (await client.post(url, headers=team.admin.headers)).json() == {"sent": 0}  # nothing is 24 hours old yet
    assert (await client.post(url, params={"force": "true"}, headers=team.admin.headers)).json() == {"sent": 1}
    assert await ChatMessage.find(ChatMessage.reminder == True).count() == 1  # noqa: E712


# --- Cleanup --------------------------------------------------------------------------------------------------------------
async def test_deleting_the_group_removes_invites_approvals_and_their_files(client, team, live):
    g = await client_group(client, team, live)
    f = await upload(client, team.mia, "logo.png", b"png", "image/png")
    await ask(client, team.mia, g, file_ids=[f["id"]])
    assert await Invite.find_all().count() == 1 and await ClientApproval.find_all().count() == 1
    assert (await client.delete(f"/chat/groups/{g['id']}", headers=team.hana.headers)).status_code == 204
    assert await Invite.find_all().count() == 0 and await ClientApproval.find_all().count() == 0 and await File.find_all().count() == 0
