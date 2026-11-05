import asyncio

from app.models import File, Notification, OfficePost
from app.models.office import CATEGORIES, REACTIONS
from tests.test_tasks import team, upload  # noqa: F401  (team is a fixture)

POSTS = "/office/posts"


async def post(client, who, text="Coffee machine is broken", category="pantry", **extra):
    return await client.post(POSTS, json={"text": text, "category": category, **extra}, headers=who.headers)


async def posts(client, who, **params):
    r = await client.get(POSTS, params=params, headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


# --- Posting ---------------------------------------------------------------------------------------------
async def test_anyone_on_the_team_posts_with_the_category_emoji(client, team):
    expected = {"pantry": "☕", "electricity": "💡", "facilities": "❄️", "it": "💻", "general": "📢"}
    assert {k: v[1] for k, v in CATEGORIES.items()} == expected
    for who, cat in ((team.mia, "pantry"), (team.hana, "electricity"), (team.admin, "facilities"), (team.ollie, "it"), (team.max, "general")):
        r = await post(client, who, f"{cat} issue", cat)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["emoji"] == expected[cat] and body["category"] == cat and body["author"]["id"] == who.id
        assert body["resolved"] is False and body["photo"] is None and body["reactions"] == [] and body["seen_count"] == 0
        assert body["is_new"] is False and body["can_resolve"] is True  # it's my own post
    assert (await post(client, team.mia, category="general")).json()["category_label"] == "General"


async def test_category_defaults_to_general_and_input_is_validated(client, team):
    r = await client.post(POSTS, json={"text": "  Fridge smells  "}, headers=team.mia.headers)
    assert r.status_code == 201 and r.json()["category"] == "general" and r.json()["text"] == "Fridge smells"
    for body in ({}, {"text": ""}, {"text": "   "}, {"text": "x" * 1001}, {"text": "ok", "category": "parking"}, {"text": "ok", "photo_id": "nope"}):
        assert (await client.post(POSTS, json=body, headers=team.mia.headers)).status_code == 422, body
    assert await OfficePost.find_all().count() == 1


async def test_clients_and_anonymous_cannot_use_the_board(client, team):
    p = (await post(client, team.mia)).json()
    assert (await client.post(POSTS, json={"text": "hi"})).status_code == 401
    assert (await client.get(POSTS)).status_code == 401
    assert (await post(client, team.cleo)).status_code == 403
    for method, url, body in (
        ("get", POSTS, None),
        ("get", "/office/summary", None),
        ("post", "/office/seen", {"ids": [p["id"]]}),
        ("put", f"{POSTS}/{p['id']}/reactions", {"emoji": "👍"}),
        ("patch", f"{POSTS}/{p['id']}", {"resolved": True}),
    ):
        r = await getattr(client, method)(url, headers=team.cleo.headers, **({"json": body} if body else {}))
        assert r.status_code == 403, (method, url)


async def test_photo_must_be_the_posters_own_image_upload(client, team):
    # the shared helper uploads text/plain, so send a real image content type like a browser would
    r = await client.post("/files", files=[("files", ("leak.png", b"\x89PNG", "image/png"))], headers=team.mia.headers)
    img = r.json()[0]
    ok = await post(client, team.mia, "Ceiling leak", "facilities", photo_id=img["id"])
    assert ok.status_code == 201 and ok.json()["photo"]["id"] == img["id"] and ok.json()["photo"]["mime"] == "image/png"

    assert (await post(client, team.mia, photo_id=(await upload(client, team.mia, "n.txt"))["id"])).status_code == 422  # not an image
    link = (await client.post("/files/link", json={"title": "pic", "url": "https://example.com/p.png"}, headers=team.mia.headers)).json()
    assert (await post(client, team.mia, photo_id=link["id"])).status_code == 422  # a link, not an upload
    assert (await post(client, team.max, photo_id=img["id"])).status_code == 422  # someone else's file
    assert (await post(client, team.mia, photo_id=str(team.design.id))).status_code == 422  # doesn't exist
    assert (await post(client, team.admin, photo_id=img["id"])).status_code == 201  # admins may use any
    assert await File.find_all().count() == 3


# --- Notifications ---------------------------------------------------------------------------------------
async def test_an_ordinary_post_notifies_nobody(client, team):
    await Notification.find_all().delete()
    await post(client, team.mia, "Coffee is finished", "pantry")
    assert await Notification.find(Notification.type == "office_post").count() == 0


async def test_important_post_notifies_every_other_team_member_with_a_matching_link(client, team):
    await Notification.find_all().delete()
    await post(client, team.mia, "AC is dripping on desk 4", "facilities", important=True)
    notes = await Notification.find(Notification.type == "office_post").to_list()
    everyone = {team.admin, team.hana, team.max, team.vic, team.ollie}  # not Mia (actor), not the client
    assert {n.user_id for n in notes} == {p.user.id for p in everyone}
    by_user = {n.user_id: n for n in notes}
    assert by_user[team.admin.user.id].link == "/admin/office" and by_user[team.hana.user.id].link == "/app/office"
    n = by_user[team.hana.user.id]
    assert "❄️" in n.title and "Mia Member" in n.title and "AC is dripping" in n.body and n.actor_id == team.mia.user.id


async def test_a_failed_post_notifies_nobody(client, team):
    await Notification.find_all().delete()
    await post(client, team.mia, "", "pantry")
    await post(client, team.cleo)
    assert await Notification.find_all().count() == 0


# --- Listing, filters, search --------------------------------------------------------------------------------
async def test_list_is_newest_first_and_keeps_resolved_posts(client, team):
    a = (await post(client, team.mia, "first", "pantry")).json()
    b = (await post(client, team.max, "second", "it")).json()
    c = (await post(client, team.hana, "third", "general")).json()
    await client.patch(f"{POSTS}/{a['id']}", json={"resolved": True}, headers=team.mia.headers)
    got = await posts(client, team.vic)
    assert [p["text"] for p in got["items"]] == ["third", "second", "first"] and got["total"] == 3  # history is kept
    assert got["items"][2]["resolved"] is True
    assert [p["id"] for p in (await posts(client, team.vic, status="open"))["items"]] == [c["id"], b["id"]]
    assert [p["id"] for p in (await posts(client, team.vic, status="resolved"))["items"]] == [a["id"]]
    assert (await posts(client, team.vic, status="all"))["total"] == 3
    assert (await client.get(POSTS, params={"status": "later"}, headers=team.vic.headers)).status_code == 422


async def test_filter_by_category_search_and_pagination(client, team):
    for i in range(5):
        await post(client, team.mia, f"Pantry note {i}", "pantry")
    await post(client, team.max, "Wi-Fi (guest) keeps dropping", "it")
    await post(client, team.max, "100% sure the lights flicker", "electricity")
    assert (await posts(client, team.vic, category="pantry"))["total"] == 5
    assert [p["category"] for p in (await posts(client, team.vic, category="it"))["items"]] == ["it"]
    assert (await client.get(POSTS, params={"category": "parking"}, headers=team.vic.headers)).status_code == 422

    assert (await posts(client, team.vic, q="WI-FI"))["total"] == 1  # case-insensitive
    assert (await posts(client, team.vic, q="(guest)"))["total"] == 1  # regex characters are literal
    assert (await posts(client, team.vic, q="100%"))["total"] == 1
    assert (await posts(client, team.vic, q=".*"))["total"] == 0
    assert (await posts(client, team.vic, q="note", category="pantry", status="open"))["total"] == 5
    assert (await posts(client, team.vic, q="note", category="it"))["total"] == 0

    page1 = await posts(client, team.vic, category="pantry", limit=2)
    page2 = await posts(client, team.vic, category="pantry", limit=2, skip=2)
    assert page1["total"] == 5 and len(page1["items"]) == 2 and not {p["id"] for p in page1["items"]} & {p["id"] for p in page2["items"]}
    assert (await client.get(POSTS, params={"limit": 0}, headers=team.vic.headers)).status_code == 422


# --- Seen by -----------------------------------------------------------------------------------------------------
async def test_viewing_marks_posts_seen_and_the_unseen_count_drops(client, team):
    a = (await post(client, team.mia, "a")).json()
    b = (await post(client, team.mia, "b")).json()
    mine = (await post(client, team.max, "mine")).json()
    got = await posts(client, team.max)
    assert got["unseen_count"] == 2 and {p["id"]: p["is_new"] for p in got["items"]} == {a["id"]: True, b["id"]: True, mine["id"]: False}

    r = await client.post("/office/seen", json={"ids": [a["id"], mine["id"]]}, headers=team.max.headers)
    assert r.status_code == 200 and r.json()["unseen_count"] == 1
    await client.post("/office/seen", json={"ids": [a["id"]]}, headers=team.max.headers)  # idempotent
    await client.post("/office/seen", json={"ids": [a["id"]]}, headers=team.hana.headers)

    got = {p["id"]: p for p in (await posts(client, team.vic))["items"]}
    assert [u["id"] for u in got[a["id"]]["seen_by"]] == [team.max.id, team.hana.id] and got[a["id"]]["seen_count"] == 2
    assert got[b["id"]]["seen_count"] == 0 and got[mine["id"]]["seen_count"] == 0  # the author's own view isn't counted
    me = {p["id"]: p for p in (await posts(client, team.max))["items"]}
    assert me[a["id"]]["is_new"] is False and me[b["id"]]["is_new"] is True
    assert (await posts(client, team.mia))["unseen_count"] == 1  # Mia only has Max's post to read


async def test_seen_validation_and_unknown_ids_are_harmless(client, team):
    a = (await post(client, team.mia, "a")).json()
    for body in ({}, {"ids": []}, {"ids": ["nope"]}, {"ids": [a["id"]] * 101}):
        assert (await client.post("/office/seen", json=body, headers=team.max.headers)).status_code == 422, body
    ghost = str(team.design.id)
    assert (await client.post("/office/seen", json={"ids": [ghost]}, headers=team.max.headers)).status_code == 200
    assert (await client.post("/office/seen", json={"ids": [a["id"]]})).status_code == 401
    assert (await OfficePost.get(a["id"])).seen_by == []


# --- Reactions ---------------------------------------------------------------------------------------------------
async def test_reactions_toggle_and_count_per_emoji(client, team):
    p = (await post(client, team.mia)).json()
    url = f"{POSTS}/{p['id']}/reactions"
    r = await client.put(url, json={"emoji": "👍"}, headers=team.max.headers)
    assert r.status_code == 200
    assert [(x["emoji"], x["count"], x["mine"], [u["id"] for u in x["users"]]) for x in r.json()["reactions"]] == [("👍", 1, True, [team.max.id])]
    await client.put(url, json={"emoji": "👍"}, headers=team.hana.headers)
    await client.put(url, json={"emoji": "🎉"}, headers=team.hana.headers)
    seen_by_vic = (await posts(client, team.vic))["items"][0]["reactions"]
    assert [(x["emoji"], x["count"], x["mine"]) for x in seen_by_vic] == [("👍", 2, False), ("🎉", 1, False)]  # in the board's emoji order
    assert {u["id"] for u in seen_by_vic[0]["users"]} == {team.max.id, team.hana.id}

    r = await client.put(url, json={"emoji": "👍"}, headers=team.max.headers)  # same emoji again takes it back
    assert [(x["emoji"], x["count"], x["mine"]) for x in r.json()["reactions"]] == [("👍", 1, False), ("🎉", 1, False)]
    await client.put(url, json={"emoji": "👍"}, headers=team.hana.headers)
    await client.put(url, json={"emoji": "❤️"}, headers=team.mia.headers)
    assert [x["emoji"] for x in (await posts(client, team.vic))["items"][0]["reactions"]] == ["❤️", "🎉"]


async def test_reaction_validation(client, team):
    p = (await post(client, team.mia)).json()
    url = f"{POSTS}/{p['id']}/reactions"
    for body in ({}, {"emoji": ""}, {"emoji": "💩"}, {"emoji": "abc"}):
        assert (await client.put(url, json=body, headers=team.max.headers)).status_code == 422, body
    assert (await client.put(url, json={"emoji": "👍"})).status_code == 401
    assert (await client.put(f"{POSTS}/{team.design.id}/reactions", json={"emoji": "👍"}, headers=team.max.headers)).status_code == 404
    for e in REACTIONS:
        assert (await client.put(url, json={"emoji": e}, headers=team.max.headers)).status_code == 200, e


# --- Resolving ---------------------------------------------------------------------------------------------------
async def test_only_the_author_or_an_admin_resolves_and_reopens(client, team):
    p = (await post(client, team.mia, "Printer jam")).json()
    url = f"{POSTS}/{p['id']}"
    for who in (team.max, team.hana, team.vic, team.cleo):  # even a head can't
        assert (await client.patch(url, json={"resolved": True}, headers=who.headers)).status_code == 403, who
    assert (await client.patch(url, json={"resolved": True})).status_code == 401
    assert (await client.patch(url, json={}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch(f"{POSTS}/{team.design.id}", json={"resolved": True}, headers=team.mia.headers)).status_code == 404

    r = await client.patch(url, json={"resolved": True}, headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["resolved"] is True and r.json()["resolved_by"]["id"] == team.mia.id and r.json()["resolved_at"]
    assert (await posts(client, team.max))["items"][0]["can_resolve"] is False
    assert (await posts(client, team.admin))["items"][0]["can_resolve"] is True

    r = await client.patch(url, json={"resolved": False}, headers=team.admin.headers)  # admin reopens someone else's
    assert r.json()["resolved"] is False and r.json()["resolved_by"] is None and r.json()["resolved_at"] is None
    r = await client.patch(url, json={"resolved": True}, headers=team.admin.headers)
    assert r.json()["resolved_by"]["id"] == team.admin.id


async def test_resolving_notifies_the_team_once(client, team):
    p = (await post(client, team.mia, "Lights out in the corridor", "electricity")).json()
    url = f"{POSTS}/{p['id']}"
    await Notification.find_all().delete()
    await client.patch(url, json={"resolved": True}, headers=team.mia.headers)
    notes = await Notification.find(Notification.type == "office_resolved").to_list()
    assert {n.user_id for n in notes} == {team.admin.user.id, team.hana.user.id, team.max.user.id, team.vic.user.id, team.ollie.user.id}
    assert "Resolved" in notes[0].title and "Mia Member resolved" in notes[0].body and "Lights out" in notes[0].body

    await Notification.find_all().delete()
    await client.patch(url, json={"resolved": True}, headers=team.mia.headers)  # already resolved: stay quiet
    assert await Notification.find_all().count() == 0

    await client.patch(url, json={"resolved": False}, headers=team.mia.headers)
    assert await Notification.find(Notification.type == "office_reopened").count() == 5


async def test_two_simultaneous_resolves_notify_once(client, team):
    p = (await post(client, team.mia)).json()
    await Notification.find_all().delete()
    await asyncio.gather(*(client.patch(f"{POSTS}/{p['id']}", json={"resolved": True}, headers=w.headers) for w in (team.mia, team.admin)))
    # one winner notifies the other five team members; the loser stays quiet
    assert await Notification.find(Notification.type == "office_resolved").count() == 5


# --- Dashboard summary -------------------------------------------------------------------------------------------
async def test_summary_has_the_latest_unresolved_posts_and_the_unseen_count(client, team):
    ids = [(await post(client, team.mia, f"issue {i}")).json()["id"] for i in range(5)]
    await client.patch(f"{POSTS}/{ids[4]}", json={"resolved": True}, headers=team.mia.headers)  # newest, but resolved
    await post(client, team.max, "from max")
    r = await client.get("/office/summary", headers=team.max.headers)
    assert r.status_code == 200
    s = r.json()
    assert [p["text"] for p in s["latest"]] == ["from max", "issue 3", "issue 2"]  # only unresolved, newest first, three of them
    assert s["open_count"] == 5 and s["unseen_count"] == 4  # Max's own post isn't unseen; the resolved one doesn't count

    await client.post("/office/seen", json={"ids": ids[:4]}, headers=team.max.headers)
    assert (await client.get("/office/summary", headers=team.max.headers)).json()["unseen_count"] == 0
    assert (await client.get("/office/summary", headers=team.hana.headers)).json()["unseen_count"] == 5  # per person
    assert (await client.get("/office/summary")).status_code == 401


async def test_empty_board(client, team):
    assert await posts(client, team.mia) == {"total": 0, "unseen_count": 0, "items": []}
    assert (await client.get("/office/summary", headers=team.mia.headers)).json() == {"unseen_count": 0, "open_count": 0, "latest": []}
