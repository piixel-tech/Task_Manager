"""Phase 10a / 10b: rich text and mentions, search, shared tabs, pins, scheduled messages, Focus mode."""
from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId

from app.models import Notification, User
from app.models.chat import ChatGroup, ChatMessage, ScheduledMessage
from app.routers import chat_extras
from app.services import link_preview, richtext
from app.services.scheduled import run_scheduled_sends
from tests.test_chat import group, groups, live, msgs, sent, upload  # noqa: F401  (live is a fixture)
from tests.test_tasks import team  # noqa: F401  (team is a fixture)


def mention(person):
    return f'<span data-type="mention" data-id="{person.id}" data-label="{person.user.name}">@{person.user.name}</span>'


async def rich(client, who, g, html, **extra):
    return await client.post(f"/chat/groups/{g['id']}/messages", json={"body": html, "html": True, **extra}, headers=who.headers)


def ids(people) -> set[str]:
    return {str(i) for i in people}


def later(minutes=60):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


# --- Rich text ----------------------------------------------------------------------------------------------------------
def test_sanitize_keeps_formatting_and_drops_anything_dangerous():
    dirty = (
        '<p onclick="x()">Hi <strong>there</strong><script>alert(1)</script></p>'
        '<a href="javascript:alert(1)">bad</a> <a href="https://ok.example/page">good</a>'
        '<img src=x onerror=alert(1)><span style="color:red" data-type="mention" data-id="abc">@x</span>'
    )
    clean = richtext.sanitize(dirty)
    assert "<script" not in clean and "alert(1)" not in clean.replace("alert(1)</a>", "")
    assert "onclick" not in clean and "onerror" not in clean and "<img" not in clean and "style=" not in clean
    assert "javascript:" not in clean
    assert '<strong>there</strong>' in clean and 'href="https://ok.example/page"' in clean
    assert 'rel="noopener noreferrer nofollow"' in clean and 'target="_blank"' in clean


def test_read_extracts_text_mentions_and_links():
    uid = "64b64b64b64b64b64b64b64b"
    clean = richtext.sanitize(
        f'<p>Hello <span data-type="mention" data-id="{uid}" data-label="A">@A</span></p>'
        f'<ul><li>one</li><li>see https://example.com/x.</li></ul><a href="https://ok.example/">site</a>'
    )
    text, mentions, links = richtext.read(clean)
    assert text.splitlines() == ["Hello @A", "one", "see https://example.com/x.", "site"]
    assert [str(m) for m in mentions] == [uid]
    assert links == ["https://ok.example/", "https://example.com/x"]  # trailing full stop is not part of the address


async def test_rich_message_is_stored_clean_and_shown_with_plain_text(client, team):
    g = await group(client, team.mia, team.max)
    r = await rich(client, team.mia, g, '<p>Hi <strong>team</strong><script>x</script></p>')
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["html"] is True and "<script" not in m["body"] and "<strong>team</strong>" in m["body"]
    assert m["text"] == "Hi team"
    assert (await groups(client, team.max))["Design chat"]["last_message"]["preview"] == "Hi team"  # no tags in previews


async def test_empty_rich_text_is_refused_and_plain_text_still_works(client, team):
    g = await group(client, team.mia, team.max)
    assert (await rich(client, team.mia, g, "<p></p>")).status_code == 422
    assert (await rich(client, team.mia, g, "<script>x</script>")).status_code == 422
    old = await sent(client, team.mia, g, "<b>not html</b>")  # plain text keeps its angle brackets as typed
    assert old["html"] is False and old["body"] == "<b>not html</b>" and old["text"] == old["body"]
    too_long = await rich(client, team.mia, g, "<p>" + "a" * 4001 + "</p>")
    assert too_long.status_code == 422


# --- Mentions ----------------------------------------------------------------------------------------------------------
async def test_mention_notifies_only_the_mentioned_people_who_can_read_it(client, team, live):
    g = await group(client, team.mia, team.max, team.vic)
    r = await rich(client, team.mia, g, f"<p>{mention(team.max)} {mention(team.mia)} {mention(team.ollie)}</p>")
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["mentions"] == [team.max.id]  # not yourself, not someone outside the group
    assert await Notification.find({"type": "mention"}).count() == 1
    note = await Notification.find_one(Notification.type == "mention")
    assert str(note.user_id) == team.max.id
    assert note.link == f"/app/chat?group={g['id']}&message={m['id']}"
    assert team.mia.user.name in note.title and g["name"] in note.title
    assert [ids(to) for to, ev, d in live.sent if ev == "notification" and d["type"] == "mention"] == [{team.max.id}]  # a live popup for the mentioned person only


async def test_mention_link_for_an_admin_goes_to_the_admin_chat(client, team):
    g = await group(client, team.mia, team.admin)
    r = await rich(client, team.mia, g, f"<p>{mention(team.admin)}</p>")
    assert r.status_code == 201
    note = await Notification.find_one(Notification.type == "mention")
    assert str(note.user_id) == team.admin.id and note.link.startswith("/admin/chat?group=")


async def test_search_can_filter_to_messages_that_mention_me(client, team):
    g = await group(client, team.mia, team.max)
    await rich(client, team.mia, g, f"<p>{mention(team.max)} please look</p>")
    await sent(client, team.mia, g, "unrelated")
    r = await client.get("/chat/search", params={"mentions_me": True}, headers=team.max.headers)
    assert [h["message"]["text"] for h in r.json()["items"]] == ["@" + team.max.user.name + " please look"]
    assert (await client.get("/chat/search", params={"mentions_me": True}, headers=team.mia.headers)).json()["items"] == []


# --- Search ---------------------------------------------------------------------------------------------------------------
async def test_search_finds_text_in_plain_and_rich_messages_in_my_groups_only(client, team):
    mine = await group(client, team.mia, team.max, name="Mine")
    other = await group(client, team.vic, team.ollie, name="Not mine")
    await sent(client, team.max, mine, "The launch plan is ready")
    await rich(client, team.max, mine, "<p>Launch <em>date</em> moved</p>")
    await sent(client, team.vic, other, "launch secrets")
    r = await client.get("/chat/search", params={"q": "launch"}, headers=team.mia.headers)
    assert r.status_code == 200, r.text
    hits = r.json()["items"]
    assert [h["message"]["text"] for h in hits] == ["Launch date moved", "The launch plan is ready"]  # newest first
    assert {h["group_name"] for h in hits} == {"Mine"}
    # every word must match, case doesn't matter, and regex characters are plain characters
    assert len((await client.get("/chat/search", params={"q": "LAUNCH moved"}, headers=team.mia.headers)).json()["items"]) == 1
    assert (await client.get("/chat/search", params={"q": ".*"}, headers=team.mia.headers)).json()["items"] == []


async def test_search_filters_by_sender_group_and_date_and_pages(client, team):
    a = await group(client, team.mia, team.max, name="A")
    b = await group(client, team.mia, team.max, name="B")
    for i in range(3):
        await sent(client, team.max, a, f"note {i}")
    await sent(client, team.mia, a, "note mia")
    await sent(client, team.max, b, "note in b")

    by_max = (await client.get("/chat/search", params={"q": "note", "sender_id": team.max.id}, headers=team.mia.headers)).json()["items"]
    assert len(by_max) == 4 and all(h["message"]["sender"]["id"] == team.max.id for h in by_max)
    only_b = (await client.get("/chat/search", params={"q": "note", "group_id": b["id"]}, headers=team.mia.headers)).json()["items"]
    assert [h["message"]["text"] for h in only_b] == ["note in b"]

    today = datetime.now(timezone.utc).date()
    day = lambda d: d.isoformat()  # noqa: E731
    assert len((await client.get("/chat/search", params={"q": "note", "date_from": day(today - timedelta(days=1)), "date_to": day(today + timedelta(days=1))}, headers=team.mia.headers)).json()["items"]) == 5
    assert (await client.get("/chat/search", params={"q": "note", "date_to": day(today - timedelta(days=3))}, headers=team.mia.headers)).json()["items"] == []

    page1 = (await client.get("/chat/search", params={"q": "note", "limit": 2}, headers=team.mia.headers)).json()
    assert len(page1["items"]) == 2 and page1["has_more"] is True
    page2 = (await client.get("/chat/search", params={"q": "note", "limit": 2, "before": page1["items"][-1]["message"]["id"]}, headers=team.mia.headers)).json()
    assert len(page2["items"]) == 2 and page2["has_more"] is True
    page3 = (await client.get("/chat/search", params={"q": "note", "limit": 2, "before": page2["items"][-1]["message"]["id"]}, headers=team.mia.headers)).json()
    assert len(page3["items"]) == 1 and page3["has_more"] is False


async def test_search_skips_deleted_messages_and_refuses_other_peoples_groups(client, team):
    g = await group(client, team.mia, team.max)
    gone = await sent(client, team.max, g, "secret one")
    hidden = await sent(client, team.max, g, "secret two")
    await client.delete(f"/chat/messages/{gone['id']}", params={"scope": "everyone"}, headers=team.max.headers)
    await client.delete(f"/chat/messages/{hidden['id']}", params={"scope": "me"}, headers=team.mia.headers)
    assert (await client.get("/chat/search", params={"q": "secret"}, headers=team.mia.headers)).json()["items"] == []
    assert len((await client.get("/chat/search", params={"q": "secret"}, headers=team.max.headers)).json()["items"]) == 1
    other = await group(client, team.vic, team.ollie)
    assert (await client.get("/chat/search", params={"group_id": other["id"]}, headers=team.mia.headers)).status_code == 403


# --- Jump to a message ----------------------------------------------------------------------------------------------------
async def test_messages_can_be_opened_around_one_and_paged_forward(client, team):
    g = await group(client, team.mia, team.max)
    ids = [(await sent(client, team.max, g, f"m{i}"))["id"] for i in range(12)]

    window = await msgs(client, team.mia, g, around=ids[6], limit=6)  # three either side
    assert [m["id"] for m in window["items"]] == ids[3:10]
    assert window["has_more"] is True and window["has_newer"] is True
    near_end = await msgs(client, team.mia, g, around=ids[11], limit=6)
    assert [m["id"] for m in near_end["items"]][-1] == ids[11] and near_end["has_newer"] is False

    forward = await msgs(client, team.mia, g, after=ids[9], limit=5)
    assert [m["id"] for m in forward["items"]] == ids[10:] and forward["has_newer"] is False
    partial = await msgs(client, team.mia, g, after=ids[2], limit=3)
    assert [m["id"] for m in partial["items"]] == ids[3:6] and partial["has_newer"] is True

    other = await group(client, team.vic, team.ollie)
    foreign = (await sent(client, team.vic, other, "x"))["id"]
    r = await client.get(f"/chat/groups/{g['id']}/messages", params={"around": foreign}, headers=team.mia.headers)
    assert r.status_code == 404


# --- Media, docs, links ----------------------------------------------------------------------------------------------------
async def test_shared_tabs_split_media_from_docs(client, team):
    g = await group(client, team.mia, team.max)
    img = await upload(client, team.mia, "pic.png", b"png", "image/png")
    vid = await upload(client, team.mia, "clip.mp4", b"mp4", "video/mp4")
    doc = await upload(client, team.mia, "brief.pdf", b"pdf", "application/pdf")
    voice = await upload(client, team.mia, "v.webm", b"a", "audio/webm")
    await sent(client, team.mia, g, "", type="image", file_id=img["id"])
    await sent(client, team.mia, g, "", type="file", file_id=vid["id"])
    await sent(client, team.mia, g, "", type="file", file_id=doc["id"])
    await sent(client, team.mia, g, "", type="voice", file_id=voice["id"], duration=3)
    await sent(client, team.mia, g, "just words")

    media = (await client.get(f"/chat/groups/{g['id']}/shared", params={"kind": "media"}, headers=team.max.headers)).json()
    assert [m["file"]["name"] for m in media["items"]] == ["clip.mp4", "pic.png"] and media["has_more"] is False
    docs = (await client.get(f"/chat/groups/{g['id']}/shared", params={"kind": "docs"}, headers=team.max.headers)).json()
    assert [m["file"]["name"] for m in docs["items"]] == ["brief.pdf"]
    assert (await client.get(f"/chat/groups/{g['id']}/shared", params={"kind": "other"}, headers=team.max.headers)).status_code == 422
    assert (await client.get(f"/chat/groups/{g['id']}/shared", params={"kind": "docs"}, headers=team.ollie.headers)).status_code == 403

    page = (await client.get(f"/chat/groups/{g['id']}/shared", params={"kind": "media", "limit": 1}, headers=team.max.headers)).json()
    assert len(page["items"]) == 1 and page["has_more"] is True


async def test_links_tab_finds_addresses_and_remembers_titles(client, team, monkeypatch):
    calls = []

    async def fake_title(url):
        calls.append(url)
        return "Example Domain" if "example.com" in url else None

    monkeypatch.setattr(chat_extras, "fetch_title", fake_title)
    g = await group(client, team.mia, team.max)
    await sent(client, team.mia, g, "docs at https://example.com/a and also https://nothing.test/x.")
    await rich(client, team.max, g, '<p>read <a href="https://example.com/b">this</a></p>')
    await sent(client, team.max, g, "no link here")

    r = await client.get(f"/chat/groups/{g['id']}/links", headers=team.mia.headers)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [(i["url"], i["title"]) for i in items] == [
        ("https://example.com/b", "Example Domain"),
        ("https://example.com/a", "Example Domain"),
        ("https://nothing.test/x", None),
    ]
    assert items[0]["sender"]["id"] == team.max.id
    first_calls = len(calls)
    await client.get(f"/chat/groups/{g['id']}/links", headers=team.mia.headers)
    assert len(calls) == first_calls  # titles are looked up once, then kept
    assert (await client.get(f"/chat/groups/{g['id']}/links", headers=team.ollie.headers)).status_code == 403


async def test_link_previews_never_reach_private_addresses():
    for url in ("http://127.0.0.1/", "http://localhost:8000/x", "http://10.0.0.5/", "http://169.254.169.254/latest", "ftp://example.com/", "http://[::1]/"):
        assert await link_preview.fetch_title(url) is None
    assert await link_preview._allowed("http://192.168.1.1/") is False


# --- Pins ------------------------------------------------------------------------------------------------------------------
async def test_pin_and_unpin_a_message(client, team, live):
    g = await group(client, team.mia, team.max)
    m = await sent(client, team.max, g, "Wifi password is on the fridge")
    r = await client.put(f"/chat/messages/{m['id']}/pin", headers=team.mia.headers)
    assert r.status_code == 200, r.text
    assert (await client.put(f"/chat/messages/{m['id']}/pin", headers=team.mia.headers)).status_code == 200  # again is fine

    pins = (await client.get(f"/chat/groups/{g['id']}/pins", headers=team.max.headers)).json()
    assert len(pins) == 1 and pins[0]["message"]["id"] == m["id"] and pins[0]["pinned_by"]["id"] == team.mia.id
    assert (await groups(client, team.max))["Design chat"]["pinned_ids"] == [m["id"]]
    assert any(ev == "chat:group" for _, ev, _ in live.sent)

    assert (await client.delete(f"/chat/messages/{m['id']}/pin", headers=team.max.headers)).status_code == 204
    assert (await client.get(f"/chat/groups/{g['id']}/pins", headers=team.max.headers)).json() == []


async def test_pins_are_capped_and_limited_to_the_team_and_members(client, team):
    g = await group(client, team.mia, team.max)
    ids = [(await sent(client, team.mia, g, f"m{i}"))["id"] for i in range(11)]
    for mid in ids[:10]:
        assert (await client.put(f"/chat/messages/{mid}/pin", headers=team.mia.headers)).status_code == 200
    assert (await client.put(f"/chat/messages/{ids[10]}/pin", headers=team.mia.headers)).status_code == 409
    assert (await client.put(f"/chat/messages/{ids[0]}/pin", headers=team.ollie.headers)).status_code == 403  # not in the group
    assert (await client.get(f"/chat/groups/{g['id']}/pins", headers=team.ollie.headers)).status_code == 403


async def test_clients_can_see_pins_but_not_change_them(client, team):
    g = await group(client, team.mia, team.max)
    await ChatGroup.find({"_id": PydanticObjectId(g["id"])}).update({"$push": {"client_ids": PydanticObjectId(team.cleo.id)}})
    m = await sent(client, team.mia, g, "Deadline is Friday")
    assert (await client.put(f"/chat/messages/{m['id']}/pin", headers=team.cleo.headers)).status_code == 403
    await client.put(f"/chat/messages/{m['id']}/pin", headers=team.mia.headers)
    assert len((await client.get(f"/chat/groups/{g['id']}/pins", headers=team.cleo.headers)).json()) == 1
    assert (await groups(client, team.cleo))["Design chat"]["can_pin"] is False


async def test_deleting_a_message_for_everyone_unpins_it(client, team):
    g = await group(client, team.mia, team.max)
    m = await sent(client, team.mia, g, "oops")
    await client.put(f"/chat/messages/{m['id']}/pin", headers=team.max.headers)
    await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.mia.headers)
    assert (await client.get(f"/chat/groups/{g['id']}/pins", headers=team.max.headers)).json() == []
    assert (await groups(client, team.max))["Design chat"]["pinned_ids"] == []
    assert (await client.put(f"/chat/messages/{m['id']}/pin", headers=team.max.headers)).status_code == 409


# --- Scheduled messages --------------------------------------------------------------------------------------------------
async def schedule(client, who, g, html="<p>Good morning</p>", send_at=None, **extra):
    return await client.post(f"/chat/groups/{g['id']}/scheduled", json={"body": html, "send_at": send_at or later(), **extra}, headers=who.headers)


async def make_due(scheduled_id):
    await ScheduledMessage.find({"_id": PydanticObjectId(scheduled_id)}).update({"$set": {"send_at": datetime.now(timezone.utc) - timedelta(minutes=1)}})


async def test_schedule_validates_time_and_content(client, team):
    g = await group(client, team.mia, team.max)
    assert (await schedule(client, team.mia, g, send_at=(datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat())).status_code == 422
    assert (await schedule(client, team.mia, g, send_at=later(60 * 24 * 400))).status_code == 422
    assert (await schedule(client, team.mia, g, html="<p></p>")).status_code == 422
    stranger_file = await upload(client, team.max, "theirs.txt")
    assert (await schedule(client, team.mia, g, html="", file_ids=[stranger_file["id"]])).status_code == 422
    assert (await schedule(client, team.ollie, g)).status_code == 403
    ok = await schedule(client, team.mia, g, html="<p>Hi <script>x</script><b>all</b></p>")
    assert ok.status_code == 201, ok.text
    assert ok.json()["text"] == "Hi all" and "<script" not in ok.json()["body"]
    assert await ChatMessage.find({"group_id": PydanticObjectId(g["id"])}).count() == 0  # nothing is sent yet


async def test_scheduled_list_is_mine_and_can_be_edited_or_cancelled(client, team):
    g = await group(client, team.mia, team.max)
    soon = (await schedule(client, team.mia, g, "<p>soon</p>", later(30))).json()
    far = (await schedule(client, team.mia, g, "<p>far</p>", later(300))).json()
    await schedule(client, team.max, g, "<p>maxs</p>")

    mine = (await client.get(f"/chat/groups/{g['id']}/scheduled", headers=team.mia.headers)).json()
    assert [s["text"] for s in mine] == ["soon", "far"]
    assert [s["text"] for s in (await client.get(f"/chat/groups/{g['id']}/scheduled", headers=team.max.headers)).json()] == ["maxs"]

    edited = await client.patch(f"/chat/scheduled/{far['id']}", json={"body": "<p>far, edited</p>", "send_at": later(20)}, headers=team.mia.headers)
    assert edited.status_code == 200, edited.text
    assert [s["text"] for s in (await client.get(f"/chat/groups/{g['id']}/scheduled", headers=team.mia.headers)).json()] == ["far, edited", "soon"]
    assert (await client.patch(f"/chat/scheduled/{far['id']}", json={"body": "<p></p>"}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch(f"/chat/scheduled/{far['id']}", json={"send_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}, headers=team.mia.headers)).status_code == 422

    assert (await client.patch(f"/chat/scheduled/{soon['id']}", json={"body": "<p>hijack</p>"}, headers=team.max.headers)).status_code == 404
    assert (await client.delete(f"/chat/scheduled/{soon['id']}", headers=team.max.headers)).status_code == 404
    assert (await client.delete(f"/chat/scheduled/{soon['id']}", headers=team.mia.headers)).status_code == 204
    assert (await client.delete(f"/chat/scheduled/{soon['id']}", headers=team.mia.headers)).status_code == 404  # already gone
    assert [s["text"] for s in (await client.get(f"/chat/groups/{g['id']}/scheduled", headers=team.mia.headers)).json()] == ["far, edited"]


async def test_the_job_sends_due_messages_as_the_author_once(client, team, live):
    g = await group(client, team.mia, team.max)
    live.online.add(PydanticObjectId(team.max.id))
    due = (await schedule(client, team.mia, g, f"<p>Morning {mention(team.max)}</p>")).json()
    waiting = (await schedule(client, team.mia, g, "<p>later</p>", later(600))).json()
    await make_due(due["id"])

    assert await run_scheduled_sends() == 1
    assert await run_scheduled_sends() == 0  # nothing is sent twice

    items = (await msgs(client, team.max, g))["items"]
    assert len(items) == 1 and items[0]["text"] == "Morning @" + team.max.user.name and items[0]["sender"]["id"] == team.mia.id
    assert items[0]["mentions"] == [team.max.id] and items[0]["status"] == "delivered"  # an ordinary message, mention and all
    assert any(ev == "chat:message" for _, ev, _ in live.sent)
    assert await Notification.find({"type": "mention"}).count() == 1
    assert [s["id"] for s in (await client.get(f"/chat/groups/{g['id']}/scheduled", headers=team.mia.headers)).json()] == [waiting["id"]]


async def test_a_cancelled_message_is_never_sent(client, team):
    g = await group(client, team.mia, team.max)
    s = (await schedule(client, team.mia, g)).json()
    await make_due(s["id"])
    await client.delete(f"/chat/scheduled/{s['id']}", headers=team.mia.headers)
    assert await run_scheduled_sends() == 0
    assert (await msgs(client, team.max, g))["items"] == []


async def test_scheduled_files_go_out_as_messages_with_the_text_as_caption(client, team):
    g = await group(client, team.mia, team.max)
    img = await upload(client, team.mia, "a.png", b"png", "image/png")
    doc = await upload(client, team.mia, "b.pdf", b"pdf", "application/pdf")
    s = (await schedule(client, team.mia, g, "<p>Here you go</p>", file_ids=[img["id"], doc["id"]])).json()
    assert [f["name"] for f in s["files"]] == ["a.png", "b.pdf"]
    await make_due(s["id"])
    assert await run_scheduled_sends() == 1
    items = (await msgs(client, team.max, g))["items"]
    assert [(m["type"], m["file"]["name"], m["text"]) for m in items] == [("image", "a.png", "Here you go"), ("file", "b.pdf", "")]


async def test_a_message_that_can_no_longer_be_sent_fails_and_tells_the_author(client, team):
    g = await group(client, team.mia, team.max)
    s = (await schedule(client, team.max, g, "<p>too late</p>")).json()
    await make_due(s["id"])
    r = await client.delete(f"/chat/groups/{g['id']}/members/{team.max.id}", headers=team.max.headers)  # max leaves
    assert r.status_code == 200
    assert await run_scheduled_sends() == 0
    row = await ScheduledMessage.get(s["id"])
    assert row.status == "failed" and "no longer" in row.error
    note = await Notification.find_one(Notification.type == "chat_scheduled_failed")
    assert note is not None and str(note.user_id) == team.max.id
    assert (await msgs(client, team.mia, g))["items"] == []


# --- Focus mode ------------------------------------------------------------------------------------------------------------
async def test_start_and_end_focus(client, team, live):
    r = await client.put("/focus", json={"minutes": 30}, headers=team.mia.headers)
    assert r.status_code == 200, r.text
    until = datetime.fromisoformat(r.json()["focus_until"])
    assert timedelta(minutes=29) < until - datetime.now(timezone.utc) < timedelta(minutes=31)
    assert (await client.get("/auth/me", headers=team.mia.headers)).json()["focus_until"] is not None
    told = [d for to, d in live.events("focus:changed")]
    assert told and told[-1]["user_id"] == team.mia.id and told[-1]["focus_until"] is not None
    assert all(team.max.id in ids(to) for to, _ in live.events("focus:changed"))  # everyone hears, so they can show the moon

    custom = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    assert (await client.put("/focus", json={"until": custom}, headers=team.mia.headers)).status_code == 200

    r = await client.delete("/focus", headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["focus_until"] is None
    assert (await client.get("/auth/me", headers=team.mia.headers)).json()["focus_until"] is None
    assert live.events("focus:changed")[-1][1]["focus_until"] is None


async def test_focus_input_is_checked(client, team):
    h = team.mia.headers
    assert (await client.put("/focus", json={}, headers=h)).status_code == 422
    assert (await client.put("/focus", json={"minutes": 30, "until": later(30)}, headers=h)).status_code == 422
    assert (await client.put("/focus", json={"minutes": 0}, headers=h)).status_code == 422
    assert (await client.put("/focus", json={"until": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}, headers=h)).status_code == 422
    assert (await client.put("/focus", json={"until": later(60 * 24 * 8)}, headers=h)).status_code == 422
    assert (await client.put("/focus", json={"minutes": 30})).status_code == 401


async def test_others_see_who_is_in_focus_until_it_ends(client, team):
    await group(client, team.mia, team.max)
    await client.put("/focus", json={"minutes": 60}, headers=team.max.headers)
    members = {m["id"]: m for m in (await groups(client, team.mia))["Design chat"]["members"]}
    assert members[team.max.id]["focus_until"] is not None and members[team.mia.id]["focus_until"] is None
    await User.find({"_id": PydanticObjectId(team.max.id)}).update({"$set": {"focus_until": datetime.now(timezone.utc) - timedelta(seconds=1)}})
    members = {m["id"]: m for m in (await groups(client, team.mia))["Design chat"]["members"]}
    assert members[team.max.id]["focus_until"] is None  # it ended by itself


async def test_focus_saves_notifications_but_pushes_nothing_live(client, team, live):
    g = await group(client, team.mia, team.max, team.vic)
    await client.put("/focus", json={"minutes": 60}, headers=team.max.headers)
    live.sent.clear()
    await rich(client, team.mia, g, f"<p>{mention(team.max)} {mention(team.vic)}</p>")

    assert await Notification.find({"type": "mention"}).count() == 2  # both are in the bell
    pushed = [ids(to) for to, ev, _ in live.sent if ev == "notification"]
    assert pushed == [{team.vic.id}]  # only the person who isn't in focus got a live popup
    max_note = await Notification.find_one(Notification.type == "mention", Notification.user_id == PydanticObjectId(team.max.id))
    assert max_note is not None and max_note.read is False

    await client.delete("/focus", headers=team.max.headers)
    live.sent.clear()
    await rich(client, team.mia, g, f"<p>{mention(team.max)} again</p>")
    assert {team.max.id} in [ids(to) for to, ev, _ in live.sent if ev == "notification"]


async def test_new_endpoints_need_a_login(client):
    assert (await client.get("/chat/search")).status_code == 401
    assert (await client.put("/focus", json={"minutes": 30})).status_code == 401
