import asyncio
from types import SimpleNamespace

import pytest

from app.models import File, Notification
from app.models.chat import ChatGroup, ChatMessage
from app.models.office import REACTIONS
from app.services import chat as chat_service
from app.services.ws_manager import manager
from tests.test_tasks import team  # noqa: F401  (team is a fixture)


@pytest.fixture
def live(monkeypatch):
    """Capture what the server would push over WebSockets, and decide who is 'online'."""
    sent: list[tuple[set, str, dict]] = []
    online: set = set()

    async def fake_send(user_ids, event, data):
        sent.append((set(user_ids), event, data))

    monkeypatch.setattr(manager, "send_to_users", fake_send)
    monkeypatch.setattr(manager, "is_online", lambda uid: uid in online)

    def events(name):
        return [(to, data) for to, ev, data in sent if ev == name]

    return SimpleNamespace(sent=sent, online=online, events=events)


async def mk(client, who, name="Design chat", members=(), **extra):
    return await client.post("/chat/groups", json={"name": name, "member_ids": [m.id for m in members], **extra}, headers=who.headers)


async def group(client, who, *members, name="Design chat", **extra):
    r = await mk(client, who, name, members, **extra)
    assert r.status_code == 201, r.text
    return r.json()


async def say(client, who, g, text="hello", **extra):
    return await client.post(f"/chat/groups/{g['id']}/messages", json={"body": text, **extra}, headers=who.headers)


async def sent(client, who, g, text="hello", **extra):
    r = await say(client, who, g, text, **extra)
    assert r.status_code == 201, r.text
    return r.json()


async def msgs(client, who, g, **params):
    r = await client.get(f"/chat/groups/{g['id']}/messages", params=params, headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


async def upload(client, who, name, content=b"data", mime="text/plain"):
    r = await client.post("/files", files=[("files", (name, content, mime))], headers=who.headers)
    assert r.status_code == 201, r.text
    return r.json()[0]


async def groups(client, who):
    r = await client.get("/chat/groups", headers=who.headers)
    assert r.status_code == 200, r.text
    return {g["name"]: g for g in r.json()}


# --- Groups ---------------------------------------------------------------------------------------------------------
async def test_anyone_creates_a_group_and_is_in_it(client, team, live):
    r = await mk(client, team.mia, "Lunch crew", [team.max, team.vic])
    assert r.status_code == 201, r.text
    g = r.json()
    assert {m["id"] for m in g["members"]} == {team.mia.id, team.max.id, team.vic.id}  # the creator is added automatically
    assert g["created_by"] == team.mia.id and g["can_manage"] is True and g["unread_count"] == 0 and g["last_message"] is None
    assert g["subfolder"] is None
    assert (await mk(client, team.max, "Max's own", [team.max, team.max])).json()["members"][0]["id"] == team.max.id  # no duplicates
    assert (await groups(client, team.max))["Lunch crew"]["can_manage"] is False


async def test_group_validation_and_who_can_be_added(client, team):
    for body in ({}, {"name": ""}, {"name": "   "}, {"name": "x" * 101}):
        assert (await client.post("/chat/groups", json=body, headers=team.mia.headers)).status_code == 422, body
    assert (await mk(client, team.mia, "G", [team.cleo])).status_code == 422  # clients join in 8b
    assert (await mk(client, team.mia, "G", [team.admin])).status_code == 201  # admins are fine
    r = await client.post("/chat/groups", json={"name": "G", "member_ids": [str(team.design.id)]}, headers=team.mia.headers)
    assert r.status_code == 422  # not a user
    team.vic.user.is_active = False
    await team.vic.user.save()
    assert (await mk(client, team.mia, "G", [team.vic])).status_code == 422
    assert (await mk(client, team.cleo, "G")).status_code == 403  # clients can't start groups
    assert (await client.post("/chat/groups", json={"name": "G"})).status_code == 401
    assert (await client.get("/chat/groups")).status_code == 401
    assert (await client.get("/chat/groups", headers=team.cleo.headers)).json() == []  # a client sees only groups they joined: none yet
    assert (await client.get("/chat/groups", headers=team.admin.headers)).status_code == 200


async def test_creating_a_group_notifies_members_with_a_link_but_not_the_creator(client, team, live):
    await Notification.find_all().delete()
    g = await group(client, team.mia, team.admin, team.max, name="Planning")
    notes = await Notification.find(Notification.type == "chat_group").to_list()
    assert {n.user_id for n in notes} == {team.admin.user.id, team.max.user.id}
    by_user = {n.user_id: n for n in notes}
    assert by_user[team.admin.user.id].link == f"/admin/chat?group={g['id']}" and by_user[team.max.user.id].link == f"/app/chat?group={g['id']}"
    assert "Planning" in notes[0].title and "Mia Member" in notes[0].body
    pushed = live.events("chat:group")
    assert pushed and pushed[0][0] == {team.mia.user.id, team.admin.user.id, team.max.user.id}


async def test_you_only_see_groups_you_are_in_and_admins_get_no_special_view(client, team, live):
    g = await group(client, team.mia, team.max, name="Private")
    await sent(client, team.mia, g, "secret plans")
    for who in (team.admin, team.hana, team.vic):
        assert (await groups(client, who)) == {}
        assert (await client.get(f"/chat/groups/{g['id']}", headers=who.headers)).status_code == 403, who
        assert (await client.get(f"/chat/groups/{g['id']}/messages", headers=who.headers)).status_code == 403
        assert (await say(client, who, g)).status_code == 403
        assert (await client.post(f"/chat/groups/{g['id']}/read", headers=who.headers)).status_code == 403
    assert (await client.get(f"/chat/groups/{team.design.id}", headers=team.mia.headers)).status_code == 404  # no such group
    assert set(await groups(client, team.max)) == {"Private"}


async def test_link_a_group_to_a_subfolder_you_belong_to(client, team):
    g = await group(client, team.mia, team.max, subfolder_id=str(team.design.id))
    assert g["subfolder"] == {"id": str(team.design.id), "name": "Design", "project_id": str(team.project.id)}
    assert (await mk(client, team.mia, "G", [], subfolder_id=str(team.video.id))).status_code == 422  # not hers
    assert (await mk(client, team.mia, "G", [], subfolder_id=str(team.project.id))).status_code == 422  # not a subfolder
    assert (await mk(client, team.admin, "G", [], subfolder_id=str(team.video.id))).status_code == 201  # admins may link any

    url = f"/chat/groups/{g['id']}"
    r = await client.patch(url, json={"subfolder_id": None}, headers=team.mia.headers)
    assert r.json()["subfolder"] is None
    r = await client.patch(url, json={"subfolder_id": str(team.design.id)}, headers=team.mia.headers)
    assert r.json()["subfolder"]["name"] == "Design"
    assert (await client.patch(url, json={"subfolder_id": str(team.video.id)}, headers=team.mia.headers)).status_code == 422


async def test_only_the_creator_renames_or_relinks(client, team, live):
    g = await group(client, team.mia, team.max, team.hana)
    url = f"/chat/groups/{g['id']}"
    assert (await client.patch(url, json={"name": "Hijacked"}, headers=team.max.headers)).status_code == 403
    assert (await client.patch(url, json={"name": "  "}, headers=team.mia.headers)).status_code == 422
    await Notification.find_all().delete()
    r = await client.patch(url, json={"name": "  New   name "}, headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["name"] == "New name"
    assert {n.user_id for n in await Notification.find_all().to_list()} == {team.max.user.id, team.hana.user.id}
    await Notification.find_all().delete()
    await client.patch(url, json={"name": "New name"}, headers=team.mia.headers)  # no change: quiet
    assert await Notification.find_all().count() == 0


# --- Members ------------------------------------------------------------------------------------------------------------
async def test_any_member_adds_people_and_the_new_ones_are_told(client, team, live):
    g = await group(client, team.mia, team.max)
    url = f"/chat/groups/{g['id']}/members"
    await Notification.find_all().delete()
    r = await client.post(url, json={"user_ids": [team.hana.id, team.max.id]}, headers=team.max.headers)  # Max isn't the creator
    assert r.status_code == 200 and {m["id"] for m in r.json()["members"]} == {team.mia.id, team.max.id, team.hana.id}
    notes = await Notification.find_all().to_list()
    assert [n.user_id for n in notes] == [team.hana.user.id]  # only the newcomer
    assert (await client.post(url, json={"user_ids": [team.cleo.id]}, headers=team.max.headers)).status_code == 422
    assert (await client.post(url, json={"user_ids": []}, headers=team.max.headers)).status_code == 422
    assert (await client.post(url, json={"user_ids": [team.vic.id]}, headers=team.ollie.headers)).status_code == 403  # not in the group


async def test_remove_people_leave_and_the_creator_cannot_leave(client, team, live):
    g = await group(client, team.mia, team.max, team.hana, team.vic)
    base = f"/chat/groups/{g['id']}/members"
    assert (await client.delete(f"{base}/{team.hana.id}", headers=team.max.headers)).status_code == 403  # only the creator removes others
    await Notification.find_all().delete()
    r = await client.delete(f"{base}/{team.hana.id}", headers=team.mia.headers)
    assert r.status_code == 200 and team.hana.id not in {m["id"] for m in r.json()["members"]}
    assert [n.user_id for n in await Notification.find(Notification.type == "chat_group").to_list()] == [team.hana.user.id]
    assert (await client.get(f"/chat/groups/{g['id']}", headers=team.hana.headers)).status_code == 403  # lost access
    assert (await groups(client, team.hana)) == {}

    r = await client.delete(f"{base}/{team.max.id}", headers=team.max.headers)  # leaving
    assert r.status_code == 200 and r.json() is None
    assert (await client.delete(f"{base}/{team.mia.id}", headers=team.mia.headers)).status_code == 400
    assert (await client.delete(f"{base}/{team.ollie.id}", headers=team.mia.headers)).status_code == 404
    left = (await client.get(f"/chat/groups/{g['id']}", headers=team.mia.headers)).json()
    assert {m["id"] for m in left["members"]} == {team.mia.id, team.vic.id}


async def test_deleting_a_group_removes_messages_and_files(client, team, live):
    g = await group(client, team.mia, team.max)
    f = await upload(client, team.mia, "pic.png", b"png", "image/png")
    await sent(client, team.mia, g, "look", type="image", file_id=f["id"])
    await sent(client, team.max, g, "nice")
    url = f"/chat/groups/{g['id']}"
    assert (await client.delete(url, headers=team.max.headers)).status_code == 403
    assert (await client.delete(url, headers=team.hana.headers)).status_code == 403
    await Notification.find_all().delete()
    assert (await client.delete(url, headers=team.mia.headers)).status_code == 204
    assert await ChatGroup.find_all().count() == 0 and await ChatMessage.find_all().count() == 0 and await File.find_all().count() == 0
    assert [n.user_id for n in await Notification.find_all().to_list()] == [team.max.user.id]
    assert (await client.get(url, headers=team.mia.headers)).status_code == 404


# --- Sending ------------------------------------------------------------------------------------------------------------
async def test_send_a_text_message_and_everyone_in_the_group_gets_it_live(client, team, live):
    g = await group(client, team.mia, team.max, team.hana)
    live.sent.clear()
    m = await sent(client, team.mia, g, "  Lunch at 1?  ")
    assert m["body"] == "Lunch at 1?" and m["type"] == "text" and m["sender"]["id"] == team.mia.id and m["status"] == "sent"
    assert m["reactions"] == [] and m["seen_by"] == [] and m["reply"] is None and m["deleted"] is False
    (to, data), = live.events("chat:message")
    assert to == {team.mia.user.id, team.max.user.id, team.hana.user.id} and data["id"] == m["id"]  # the sender's other tabs too
    assert (await groups(client, team.max))["Design chat"]["last_message"]["preview"] == "Lunch at 1?"


async def test_message_validation(client, team):
    g = await group(client, team.mia, team.max)
    f = await upload(client, team.mia, "a.txt")
    for body in ({}, {"body": ""}, {"body": "   "}, {"body": "x" * 4001}, {"type": "text", "body": "hi", "file_id": f["id"]},
                 {"type": "file"}, {"type": "image", "body": "x"}, {"type": "voice"}, {"type": "video", "body": "x"},
                 {"type": "voice", "file_id": f["id"], "duration": -1}, {"body": "hi", "reply_to": "nope"}):
        r = await client.post(f"/chat/groups/{g['id']}/messages", json=body, headers=team.mia.headers)
        assert r.status_code == 422, body
    assert (await client.post(f"/chat/groups/{g['id']}/messages", json={"body": "hi"})).status_code == 401
    assert await ChatMessage.find_all().count() == 0


async def test_files_images_and_voice_notes(client, team):
    g = await group(client, team.mia, team.max)
    doc = await upload(client, team.mia, "plan.pdf", b"%PDF", "application/pdf")
    img = await upload(client, team.mia, "pic.png", b"png", "image/png")
    voice = await upload(client, team.mia, "voice.webm", b"audio", "audio/webm")
    m = await sent(client, team.mia, g, "", type="file", file_id=doc["id"])
    assert m["type"] == "file" and m["file"]["name"] == "plan.pdf" and m["file"]["id"] == doc["id"]
    m = await sent(client, team.mia, g, "Look!", type="image", file_id=img["id"])
    assert m["body"] == "Look!" and m["file"]["mime"] == "image/png"
    m = await sent(client, team.mia, g, "", type="voice", file_id=voice["id"], duration=12)
    assert m["type"] == "voice" and m["duration"] == 12 and m["file"]["mime"] == "audio/webm"
    assert (await groups(client, team.max))["Design chat"]["last_message"]["preview"] == "🎤 Voice message"
    assert [x["type"] for x in (await msgs(client, team.max, g))["items"]] == ["file", "image", "voice"]

    link = (await client.post("/files/link", json={"title": "t", "url": "https://example.com"}, headers=team.mia.headers)).json()
    other = await upload(client, team.max, "max.png", b"png", "image/png")
    for payload in ({"type": "image", "file_id": doc["id"]},  # not an image
                    {"type": "voice", "file_id": img["id"]},  # not audio
                    {"type": "file", "file_id": link["id"]},  # a link
                    {"type": "image", "file_id": other["id"]},  # someone else's upload
                    {"type": "file", "file_id": str(g["id"])}):  # doesn't exist
        r = await client.post(f"/chat/groups/{g['id']}/messages", json=payload, headers=team.mia.headers)
        assert r.status_code == 422, payload


async def test_replying_to_a_message(client, team):
    g = await group(client, team.mia, team.max)
    other = await group(client, team.mia, team.max, name="Other")
    first = await sent(client, team.max, g, "Can you review the logo?")
    r = await sent(client, team.mia, g, "On it", reply_to=first["id"])
    assert r["reply"]["id"] == first["id"] and r["reply"]["sender"]["id"] == team.max.id and r["reply"]["preview"] == "Can you review the logo?"
    foreign = await sent(client, team.max, other, "elsewhere")
    assert (await say(client, team.mia, g, "x", reply_to=foreign["id"])).status_code == 422  # another group's message
    await client.delete(f"/chat/messages/{first['id']}", params={"scope": "everyone"}, headers=team.max.headers)
    assert (await say(client, team.mia, g, "x", reply_to=first["id"])).status_code == 422  # can't reply to a deleted one
    shown = (await msgs(client, team.mia, g))["items"]
    assert shown[1]["reply"]["deleted"] is True and shown[1]["reply"]["preview"] == "This message was deleted"


# --- Ticks: sent, delivered, seen ---------------------------------------------------------------------------
async def test_sent_then_delivered_when_everyone_is_online(client, team, live):
    g = await group(client, team.hana, team.mia, team.max)
    live.online.update({team.mia.user.id})
    m = await sent(client, team.hana, g, "one")
    assert m["status"] == "sent" and [r["user_id"] for r in m["delivered_to"]] == [team.mia.id]  # Max is offline

    live.online.update({team.mia.user.id, team.max.user.id})
    m = await sent(client, team.hana, g, "two")
    assert m["status"] == "delivered" and {r["user_id"] for r in m["delivered_to"]} == {team.mia.id, team.max.id}
    assert all(r["at"] for r in m["delivered_to"])


async def test_a_device_coming_online_marks_waiting_messages_delivered(client, team, live):
    g = await group(client, team.hana, team.mia, team.max)
    live.online.add(team.mia.user.id)
    m = await sent(client, team.hana, g, "while you were away")
    assert m["status"] == "sent"
    live.sent.clear()
    await chat_service.on_connect(team.max.user)  # Max opens the app
    (to, data), = live.events("chat:receipts")
    assert data["kind"] == "delivered" and data["user_id"] == team.max.id and data["message_ids"] == [m["id"]] and to == set(
        (await ChatGroup.get(g["id"])).member_ids
    )
    assert (await msgs(client, team.hana, g))["items"][0]["status"] == "delivered"
    live.sent.clear()
    await chat_service.on_connect(team.max.user)  # nothing new: no event
    assert live.events("chat:receipts") == []


async def test_opening_the_chat_marks_seen_and_ticks_turn_blue_for_everyone(client, team, live):
    g = await group(client, team.hana, team.mia, team.max)
    m1 = await sent(client, team.hana, g, "one")
    m2 = await sent(client, team.hana, g, "two")
    await sent(client, team.mia, g, "from mia")
    assert (await groups(client, team.max))["Design chat"]["unread_count"] == 3
    assert (await groups(client, team.mia))["Design chat"]["unread_count"] == 2  # her own message isn't unread
    assert (await groups(client, team.hana))["Design chat"]["unread_count"] == 1

    live.sent.clear()
    r = await client.post(f"/chat/groups/{g['id']}/read", headers=team.mia.headers)
    assert r.status_code == 200 and r.json() == {"unread_count": 0}
    kinds = {d["kind"]: d for _, d in live.events("chat:receipts")}
    assert set(kinds["seen"]["message_ids"]) == {m1["id"], m2["id"]} and kinds["seen"]["user_id"] == team.mia.id  # not her own
    assert (await groups(client, team.mia))["Design chat"]["unread_count"] == 0

    first = (await msgs(client, team.hana, g))["items"][0]
    assert first["status"] == "sent"  # Max hasn't read it, nor been delivered
    assert [r["user_id"] for r in first["seen_by"]] == [team.mia.id] and first["seen_by"][0]["at"]  # who and when

    await client.post(f"/chat/groups/{g['id']}/read", headers=team.max.headers)
    items = (await msgs(client, team.hana, g))["items"]
    assert [i["status"] for i in items] == ["seen", "seen", "sent"]  # Hana hasn't read Mia's message yet
    assert {r["user_id"] for r in items[0]["seen_by"]} == {team.mia.id, team.max.id}
    await client.post(f"/chat/groups/{g['id']}/read", headers=team.hana.headers)
    assert (await msgs(client, team.mia, g))["items"][2]["status"] == "seen"

    live.sent.clear()
    await client.post(f"/chat/groups/{g['id']}/read", headers=team.max.headers)  # again: nothing changes, nothing pushed
    assert live.events("chat:receipts") == []


async def test_read_is_for_members_only_and_unread_totals(client, team, live):
    a = await group(client, team.hana, team.mia, name="A")
    b = await group(client, team.hana, team.mia, name="B")
    await sent(client, team.hana, a, "1")
    await sent(client, team.hana, a, "2")
    await sent(client, team.hana, b, "3")
    r = (await client.get("/chat/unread", headers=team.mia.headers)).json()
    assert r["total"] == 3 and r["by_group"] == {a["id"]: 2, b["id"]: 1}
    await client.post(f"/chat/groups/{a['id']}/read", headers=team.mia.headers)
    assert (await client.get("/chat/unread", headers=team.mia.headers)).json()["total"] == 1
    assert (await client.get("/chat/unread", headers=team.max.headers)).json() == {"total": 0, "by_group": {}}
    assert (await client.get("/chat/unread")).status_code == 401


async def test_people_added_later_do_not_inherit_unread_or_hold_back_old_ticks(client, team, live):
    g = await group(client, team.hana, team.mia)
    old = await sent(client, team.hana, g, "before Max")
    await asyncio.sleep(0.02)
    await client.post(f"/chat/groups/{g['id']}/members", json={"user_ids": [team.max.id]}, headers=team.hana.headers)
    await asyncio.sleep(0.02)
    assert (await groups(client, team.max))["Design chat"]["unread_count"] == 0  # history isn't "new" to him
    assert [m["id"] for m in (await msgs(client, team.max, g))["items"]] == [old["id"]]  # but he can read it
    await client.post(f"/chat/groups/{g['id']}/read", headers=team.mia.headers)
    assert (await msgs(client, team.hana, g))["items"][0]["status"] == "seen"  # Max isn't owed that old message

    await sent(client, team.hana, g, "after Max")
    assert (await groups(client, team.max))["Design chat"]["unread_count"] == 1
    await client.post(f"/chat/groups/{g['id']}/read", headers=team.max.headers)
    assert [r["user_id"] for r in (await msgs(client, team.hana, g))["items"][0]["seen_by"]] == [team.mia.id]  # no back-filled receipts


# --- Typing -------------------------------------------------------------------------------------------------------------
async def test_typing_goes_to_everyone_else_in_the_group(client, team, live):
    g = await group(client, team.mia, team.max, team.hana)
    live.sent.clear()
    await chat_service.typing(team.mia.user, g["id"])
    (to, data), = live.events("chat:typing")
    assert to == {team.max.user.id, team.hana.user.id} and data == {"group_id": g["id"], "user_id": team.mia.id, "name": "Mia Member"}
    live.sent.clear()
    for who, gid in ((team.vic.user, g["id"]), (team.mia.user, str(team.design.id)), (team.mia.user, "nope"), (team.mia.user, None)):
        await chat_service.typing(who, gid)  # not a member / no such group / garbage: ignored
    assert live.events("chat:typing") == []


# --- Reactions ----------------------------------------------------------------------------------------------------------
async def test_reactions_toggle_and_are_pushed(client, team, live):
    g = await group(client, team.mia, team.max, team.hana)
    m = await sent(client, team.mia, g, "ship it")
    url = f"/chat/messages/{m['id']}/reactions"
    live.sent.clear()
    r = await client.put(url, json={"emoji": "👍"}, headers=team.max.headers)
    assert r.status_code == 200 and r.json()["reactions"] == [{"emoji": "👍", "user_ids": [team.max.id]}]
    assert live.events("chat:message_update")[0][1]["reactions"][0]["emoji"] == "👍"
    await client.put(url, json={"emoji": "👍"}, headers=team.hana.headers)
    await client.put(url, json={"emoji": "🎉"}, headers=team.hana.headers)
    r = await client.put(url, json={"emoji": "👍"}, headers=team.max.headers)  # takes it back
    assert [(x["emoji"], len(x["user_ids"])) for x in r.json()["reactions"]] == [("👍", 1), ("🎉", 1)]
    for body in ({}, {"emoji": "💩"}):
        assert (await client.put(url, json=body, headers=team.max.headers)).status_code == 422
    assert (await client.put(url, json={"emoji": "👍"}, headers=team.vic.headers)).status_code == 403  # not in the group
    assert (await client.put(url, json={"emoji": "👍"})).status_code == 401
    assert (await client.put(f"/chat/messages/{g['id']}/reactions", json={"emoji": REACTIONS[0]}, headers=team.max.headers)).status_code == 404


# --- Deleting -----------------------------------------------------------------------------------------------------------
async def test_delete_for_me_hides_it_only_from_me(client, team, live):
    g = await group(client, team.mia, team.max)
    m1 = await sent(client, team.mia, g, "keep")
    m2 = await sent(client, team.mia, g, "oops")
    live.sent.clear()
    r = await client.delete(f"/chat/messages/{m2['id']}", headers=team.max.headers)  # scope defaults to me
    assert r.status_code == 204
    (to, data), = live.events("chat:message_removed")
    assert to == {team.max.user.id} and data["message_id"] == m2["id"]  # only my own devices hear about it
    assert [m["body"] for m in (await msgs(client, team.max, g))["items"]] == ["keep"]
    assert [m["body"] for m in (await msgs(client, team.mia, g))["items"]] == ["keep", "oops"]
    assert (await groups(client, team.max))["Design chat"]["last_message"]["preview"] == "keep"
    assert (await groups(client, team.max))["Design chat"]["unread_count"] == 1  # the hidden one doesn't count
    assert (await client.delete(f"/chat/messages/{m2['id']}", headers=team.max.headers)).status_code == 404  # already gone for him
    assert (await client.delete(f"/chat/messages/{m1['id']}", headers=team.vic.headers)).status_code == 403
    assert (await client.delete(f"/chat/messages/{m1['id']}", params={"scope": "nobody"}, headers=team.mia.headers)).status_code == 422
    assert (await client.delete(f"/chat/messages/{m1['id']}")).status_code == 401


async def test_delete_for_everyone_is_the_senders_and_removes_the_content(client, team, live):
    g = await group(client, team.mia, team.max)
    f = await upload(client, team.mia, "pic.png", b"png", "image/png")
    m = await sent(client, team.mia, g, "regret", type="image", file_id=f["id"])
    await client.put(f"/chat/messages/{m['id']}/reactions", json={"emoji": "👍"}, headers=team.max.headers)
    url = f"/chat/messages/{m['id']}"
    assert (await client.delete(url, params={"scope": "everyone"}, headers=team.max.headers)).status_code == 403  # not his
    assert (await client.delete(url, params={"scope": "everyone"}, headers=team.admin.headers)).status_code == 403  # not in the group
    live.sent.clear()
    assert (await client.delete(url, params={"scope": "everyone"}, headers=team.mia.headers)).status_code == 204
    (to, data), = live.events("chat:message_update")
    assert data["deleted"] is True and data["body"] == "" and data["file"] is None and data["reactions"] == [] and to == set((await ChatGroup.get(g["id"])).member_ids)
    for who in (team.mia, team.max):
        shown = (await msgs(client, who, g))["items"]
        assert len(shown) == 1 and shown[0]["deleted"] is True and shown[0]["body"] == "" and shown[0]["type"] == "image"
    assert await File.find_all().count() == 0  # the upload is gone too
    assert (await groups(client, team.max))["Design chat"]["last_message"]["preview"] == "This message was deleted"
    assert (await client.delete(url, params={"scope": "everyone"}, headers=team.mia.headers)).status_code == 204  # idempotent
    assert (await client.put(f"{url}/reactions", json={"emoji": "👍"}, headers=team.max.headers)).status_code == 409
    assert (await groups(client, team.max))["Design chat"]["unread_count"] == 0


# --- Forwarding ---------------------------------------------------------------------------------------------------------
async def test_forward_into_other_groups_keeps_the_original_sender(client, team, live):
    src = await group(client, team.mia, team.max, name="Src")
    a = await group(client, team.max, team.hana, name="A")
    b = await group(client, team.max, team.vic, name="B")
    original = await sent(client, team.mia, src, "Client approved the logo")
    live.sent.clear()
    r = await client.post(f"/chat/messages/{original['id']}/forward", json={"group_ids": [a["id"], b["id"], a["id"]]}, headers=team.max.headers)
    assert r.status_code == 201, r.text
    out = r.json()
    assert [m["group_id"] for m in out] == [a["id"], b["id"]]  # duplicates collapsed
    assert all(m["body"] == "Client approved the logo" and m["sender"]["id"] == team.max.id and m["forwarded_from"]["id"] == team.mia.id for m in out)
    assert len(live.events("chat:message")) == 2
    assert [m["forwarded_from"]["id"] for m in (await msgs(client, team.hana, a))["items"]] == [team.mia.id]

    again = (await client.post(f"/chat/messages/{out[0]['id']}/forward", json={"group_ids": [src["id"]]}, headers=team.max.headers)).json()
    assert again[0]["forwarded_from"]["id"] == team.mia.id  # a forward of a forward still credits the first sender


async def test_forward_rules(client, team):
    src = await group(client, team.mia, team.max, name="Src")
    mine = await group(client, team.max, name="Mine")
    theirs = await group(client, team.hana, team.vic, name="Theirs")
    m = await sent(client, team.mia, src, "hi")
    url = f"/chat/messages/{m['id']}/forward"
    assert (await client.post(url, json={"group_ids": [mine["id"], theirs["id"]]}, headers=team.max.headers)).status_code == 403
    assert (await msgs(client, team.max, mine))["items"] == []  # all or nothing
    assert (await client.post(url, json={"group_ids": [mine["id"]]}, headers=team.hana.headers)).status_code == 403  # can't see the source
    for body in ({}, {"group_ids": []}, {"group_ids": [str(team.design.id)] * 11}):
        assert (await client.post(url, json=body, headers=team.max.headers)).status_code == 422, body
    assert (await client.post(url, json={"group_ids": [str(team.design.id)]}, headers=team.max.headers)).status_code == 404
    await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.mia.headers)
    assert (await client.post(url, json={"group_ids": [mine["id"]]}, headers=team.max.headers)).status_code == 409


async def test_a_forwarded_file_survives_the_original_being_deleted(client, team):
    src = await group(client, team.mia, team.max, name="Src")
    dst = await group(client, team.max, name="Dst")
    f = await upload(client, team.mia, "brief.pdf", b"%PDF", "application/pdf")
    m = await sent(client, team.mia, src, "", type="file", file_id=f["id"])
    copy = (await client.post(f"/chat/messages/{m['id']}/forward", json={"group_ids": [dst["id"]]}, headers=team.max.headers)).json()[0]
    await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.mia.headers)
    assert await File.find_all().count() == 1  # the copy still needs it
    assert (await msgs(client, team.max, dst))["items"][0]["file"]["id"] == f["id"]
    await client.delete(f"/chat/messages/{copy['id']}", params={"scope": "everyone"}, headers=team.max.headers)
    assert await File.find_all().count() == 0


# --- Loading older messages ------------------------------------------------------------------------------------------
async def test_messages_load_in_pages_newest_first_then_older_on_request(client, team):
    g = await group(client, team.mia, team.max)
    for i in range(75):
        await ChatMessage(group_id=g["id"], sender_id=team.mia.user.id, body=f"m{i}").insert()
    page = await msgs(client, team.max, g)
    assert [m["body"] for m in page["items"]] == [f"m{i}" for i in range(45, 75)] and page["has_more"] is True  # 30, oldest first
    older = await msgs(client, team.max, g, before=page["items"][0]["id"])
    assert [m["body"] for m in older["items"]] == [f"m{i}" for i in range(15, 45)] and older["has_more"] is True
    oldest = await msgs(client, team.max, g, before=older["items"][0]["id"])
    assert [m["body"] for m in oldest["items"]] == [f"m{i}" for i in range(15)] and oldest["has_more"] is False
    assert len((await msgs(client, team.max, g, limit=5))["items"]) == 5
    for params in ({"limit": 0}, {"limit": 101}, {"before": "nope"}):
        assert (await client.get(f"/chat/groups/{g['id']}/messages", params=params, headers=team.max.headers)).status_code == 422, params
    assert (await msgs(client, team.max, g, before="000000000000000000000000"))["items"] == []


async def test_groups_are_ordered_by_latest_activity(client, team):
    a = await group(client, team.mia, team.max, name="A")
    b = await group(client, team.mia, team.max, name="B")
    c = await group(client, team.mia, team.max, name="C")
    await sent(client, team.mia, a, "newest")
    r = await client.get("/chat/groups", headers=team.mia.headers)
    assert [g["name"] for g in r.json()] == ["A", "C", "B"]  # activity first, then newest group
    assert r.json()[0]["last_message"] == {**r.json()[0]["last_message"], "preview": "newest", "mine": True}
    assert b["id"] and c["id"]
