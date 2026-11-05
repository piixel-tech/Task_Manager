"""Phase 10c: rich descriptions, the task Activity panel, subfolder Mid-way changes, and message -> task."""
from beanie import PydanticObjectId

from app.models import File, Notification, Task, TaskActivity, TrashItem
from app.services.trash import purge
from app.models.chat import ChatGroup, ChatMessage
from tests.test_chat import group, live, sent, upload  # noqa: F401  (live is a fixture)
from tests.test_reviews import submit
from tests.test_tasks import create, make_task, team  # noqa: F401  (team is a fixture)


def mention(person):
    return f'<span data-type="mention" data-id="{person.id}" data-label="{person.user.name}">@{person.user.name}</span>'


async def post(client, who, task, html="<p>Please make the logo bigger</p>", kind="change_request", **extra):
    return await client.post(f"/tasks/{task['id']}/activity", json={"kind": kind, "body": html, **extra}, headers=who.headers)


async def entries(client, who, task):
    r = await client.get(f"/tasks/{task['id']}/activity", headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


async def notes(type_, user):
    return await Notification.find({"type": type_, "user_id": PydanticObjectId(user.id)}).to_list()


# --- Rich descriptions -------------------------------------------------------------------------------------------------
async def test_task_description_can_be_rich_text_and_is_cleaned(client, team):
    r = await create(client, team.hana, team.design, team.mia, description="<p>Do <strong>this</strong><script>x</script></p>", html=True)
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["description_html"] is True and "<script" not in t["description"] and "<strong>this</strong>" in t["description"]
    assert t["description_text"] == "Do this"

    assert (await create(client, team.hana, team.design, team.mia, description="<p></p>", html=True)).status_code == 422
    plain = (await create(client, team.hana, team.design, team.mia, description="<b>as typed</b>")).json()
    assert plain["description_html"] is False and plain["description_text"] == "<b>as typed</b>"

    r = await client.patch(f"/tasks/{plain['id']}", json={"description": "<p>Now <em>rich</em></p>", "html": True}, headers=team.hana.headers)
    assert r.status_code == 200 and r.json()["description_html"] is True and r.json()["description_text"] == "Now rich"
    assert (await client.patch(f"/tasks/{plain['id']}", json={"description": "<p></p>", "html": True}, headers=team.hana.headers)).status_code == 422


# --- Mid-way changes ----------------------------------------------------------------------------------------------------
async def test_anyone_who_can_see_the_task_posts_a_change_and_the_right_people_hear(client, team):
    t = await make_task(client, team)  # Hana's task for Mia
    r = await post(client, team.max, t)  # a colleague, not the assignee
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["kind"] == "change_request" and e["resolved"] is False and e["author"]["id"] == team.max.id
    assert e["text"] == "Please make the logo bigger"
    assert len(await notes("change_request", team.mia)) == 1 and len(await notes("change_request", team.hana)) == 1  # assignee and head
    assert await notes("change_request", team.max) == []  # not the author
    assert (await notes("change_request", team.mia))[0].link == f"/app/tasks/{t['id']}?tab=activity&entry={e['id']}"
    assert (await post(client, team.ollie, t)).status_code == 403  # no access to the task
    assert (await post(client, team.cleo, t)).status_code == 403
    assert (await post(client, team.max, t, html="<p></p>")).status_code == 422


async def test_a_change_with_only_a_file_is_fine(client, team):
    t = await make_task(client, team)
    f = await upload(client, team.max, "ref.png", b"x", "image/png")
    r = await post(client, team.max, t, html="", file_ids=[f["id"]])
    assert r.status_code == 201 and [x["name"] for x in r.json()["files"]] == ["ref.png"]
    theirs = await upload(client, team.mia, "theirs.txt")
    assert (await post(client, team.max, t, html="<p>x</p>", file_ids=[theirs["id"]])).status_code == 422


async def test_resolving_is_for_the_assignee_heads_and_admins_and_updates_the_badge(client, team):
    t = await make_task(client, team)
    a = (await post(client, team.max, t)).json()
    b = (await post(client, team.max, t, html="<p>And the colours</p>")).json()
    assert (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()["unresolved_changes"] == 2
    listed = (await client.get("/tasks", headers=team.mia.headers)).json()
    assert [x["unresolved_changes"] for x in listed] == [2]  # the badge on the task card

    assert (await client.put(f"/activity/{a['id']}/resolved", json={"resolved": True}, headers=team.max.headers)).status_code == 403  # a colleague
    r = await client.put(f"/activity/{a['id']}/resolved", json={"resolved": True}, headers=team.mia.headers)  # the assignee
    assert r.status_code == 200 and r.json()["resolved"] is True and r.json()["resolved_by"]["id"] == team.mia.id
    assert (await client.put(f"/activity/{b['id']}/resolved", json={"resolved": True}, headers=team.hana.headers)).status_code == 200  # a head
    assert (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()["unresolved_changes"] == 0
    assert len(await notes("activity_resolved", team.max)) == 2  # the author hears

    r = await client.put(f"/activity/{a['id']}/resolved", json={"resolved": False}, headers=team.admin.headers)  # an admin reopens
    assert r.status_code == 200 and r.json()["resolved"] is False and r.json()["resolved_by"] is None
    assert (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()["unresolved_changes"] == 1


async def test_can_resolve_flags_match_who_may(client, team):
    t = await make_task(client, team)
    await post(client, team.max, t)

    async def flag(who):
        change = next(e for e in (await entries(client, who, t))["items"] if e["kind"] == "change_request")
        return change["can_resolve"]

    assert await flag(team.mia) is True and await flag(team.max) is False and await flag(team.hana) is True


async def test_replies_reactions_and_deleting(client, team):
    t = await make_task(client, team)
    top = (await post(client, team.max, t)).json()
    r = await post(client, team.mia, t, html="<p>On it</p>", parent_id=top["id"])
    assert r.status_code == 201 and r.json()["parent_id"] == top["id"] and r.json()["kind"] == "change_request"
    assert len(await notes("activity_reply", team.max)) == 1
    assert (await post(client, team.mia, t, html="<p>nested</p>", parent_id=r.json()["id"])).status_code == 422  # one level of replies
    assert (await client.put(f"/activity/{top['id']}/resolved", json={"resolved": True}, headers=team.mia.headers)).status_code == 200
    assert (await client.put(f"/activity/{r.json()['id']}/resolved", json={"resolved": True}, headers=team.mia.headers)).status_code == 422  # replies aren't ticked
    assert (await entries(client, team.mia, t))["unresolved"] == 0

    e = (await client.put(f"/activity/{top['id']}/reactions", json={"emoji": "👍"}, headers=team.mia.headers)).json()
    assert e["reactions"] == [{"emoji": "👍", "user_ids": [team.mia.id]}]
    assert (await client.put(f"/activity/{top['id']}/reactions", json={"emoji": "👍"}, headers=team.mia.headers)).json()["reactions"] == []
    assert (await client.put(f"/activity/{top['id']}/reactions", json={"emoji": "x"}, headers=team.mia.headers)).status_code == 422

    assert (await client.delete(f"/activity/{top['id']}", headers=team.mia.headers)).status_code == 403  # not theirs
    assert (await client.delete(f"/activity/{top['id']}", headers=team.max.headers)).status_code == 204
    assert [x for x in (await entries(client, team.mia, t))["items"] if x["kind"] != "log"] == []  # the reply went with it


# --- Comments ------------------------------------------------------------------------------------------------------------------
async def test_comments_mention_and_assign(client, team):
    t = await make_task(client, team)
    r = await post(client, team.hana, t, f"<p>{mention(team.max)} {mention(team.ollie)} thoughts?</p>", kind="comment", assigned_to=team.max.id)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["kind"] == "comment" and c["assigned_to"]["id"] == team.max.id and c["mentions"] == [team.max.id]  # Ollie can't see the task
    assert len(await notes("mention", team.max)) == 1 and await notes("activity_assigned", team.max) == []  # one notification, the stronger one
    assert await notes("mention", team.ollie) == []
    assert len(await notes("task_comment", team.mia)) == 1  # the assignee hears about comments

    assert (await post(client, team.hana, t, "<p>x</p>", kind="comment", assigned_to=team.ollie.id)).status_code == 422  # can't see it
    assert (await post(client, team.hana, t, "<p>x</p>", kind="comment", assigned_to=team.cleo.id)).status_code == 422
    top = (await post(client, team.hana, t, "<p>top</p>", kind="comment")).json()
    assert (await post(client, team.mia, t, "<p>x</p>", kind="comment", assigned_to=team.max.id, parent_id=top["id"])).status_code == 422  # replies aren't assigned

    assert (await client.put(f"/activity/{c['id']}/resolved", json={"resolved": True}, headers=team.mia.headers)).status_code == 403  # assignee of the TASK, not the comment
    assert (await client.put(f"/activity/{c['id']}/resolved", json={"resolved": True}, headers=team.max.headers)).status_code == 200  # assigned to Max
    assert (await client.put(f"/activity/{top['id']}/resolved", json={"resolved": True}, headers=team.hana.headers)).status_code == 200  # its author
    assert (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()["unresolved_changes"] == 0  # comments don't count


async def test_assigning_a_comment_notifies_when_not_mentioned(client, team):
    t = await make_task(client, team)
    await post(client, team.hana, t, "<p>Can you check?</p>", kind="comment", assigned_to=team.max.id)
    assert len(await notes("activity_assigned", team.max)) == 1


# --- The automatic log ---------------------------------------------------------------------------------------------------------
async def log_lines(client, who, task):
    return [(e["author"]["id"], e["text"]) for e in (await entries(client, who, task))["items"] if e["kind"] == "log"]


async def test_log_records_what_happens_to_a_task(client, team):
    t = await make_task(client, team, due_date="2030-01-01")
    assert await log_lines(client, team.mia, t) == [(team.hana.id, "created this task"), (team.hana.id, f"assigned this task to {team.mia.user.name}")]

    await client.patch(f"/tasks/{t['id']}", json={"due_date": "2030-02-02"}, headers=team.hana.headers)
    await client.patch(f"/tasks/{t['id']}", json={"due_date": ""}, headers=team.hana.headers)
    await client.patch(f"/tasks/{t['id']}/progress", json={"progress": 40}, headers=team.mia.headers)
    await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.max.id}, headers=team.hana.headers)
    f = await upload(client, team.hana, "ref.txt")
    await client.patch(f"/tasks/{t['id']}", json={"asset_ids": [f["id"]]}, headers=team.hana.headers)
    await client.patch(f"/tasks/{t['id']}", json={"title": "Same but renamed"}, headers=team.hana.headers)  # not logged: not on the list

    lines = [text for _, text in await log_lines(client, team.hana, t)]
    assert lines[2:] == [
        "changed the due date from 2030-01-01 to 2030-02-02",
        "changed the due date from 2030-02-02 to none",
        "changed progress from 0% to 40%",
        f"reassigned this task from {team.mia.user.name} to {team.max.user.name}",
        "added 1 attachment",
    ]
    await client.patch(f"/tasks/{t['id']}/progress", json={"progress": 40}, headers=team.max.headers)  # no change: no line
    assert len(await log_lines(client, team.hana, t)) == 7


async def test_log_follows_review_decisions(client, team):
    t = await make_task(client, team)
    r = await submit(client, team.mia, t, team.hana)
    await client.post(f"/reviews/{r.json()['id']}/request-changes", json={"comments": "More blue"}, headers=team.hana.headers)
    r2 = await submit(client, team.mia, t, team.hana)
    await client.post(f"/reviews/{r2.json()['id']}/approve", json={}, headers=team.hana.headers)
    lines = [text for _, text in await log_lines(client, team.mia, t)][2:]
    assert lines == [
        "submitted this task for review (round 1)",
        "requested changes",
        "submitted this task for review (round 2)",
        "approved the task",
    ]


async def test_log_lines_are_read_only(client, team):
    t = await make_task(client, team)
    line = next(e for e in (await entries(client, team.admin, t))["items"] if e["kind"] == "log")
    assert line["can_delete"] is False and line["can_resolve"] is False
    assert (await client.delete(f"/activity/{line['id']}", headers=team.admin.headers)).status_code == 422
    assert (await client.put(f"/activity/{line['id']}/resolved", json={"resolved": True}, headers=team.admin.headers)).status_code == 422
    assert (await client.put(f"/activity/{line['id']}/reactions", json={"emoji": "👍"}, headers=team.admin.headers)).status_code == 422


async def test_deleting_a_task_removes_its_activity_and_keeps_files_in_the_trash(client, team):
    t = await make_task(client, team)
    f = await upload(client, team.max, "ref.png", b"x", "image/png")
    await post(client, team.max, t, "<p>x</p>", file_ids=[f["id"]])
    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 204
    assert await TaskActivity.find_all().count() == 0
    assert await File.get(PydanticObjectId(f["id"])) is not None  # soft delete: the file waits in the Trash with the task
    item = await TrashItem.find_one()
    await purge(item)  # ...and goes when the Trash is emptied for good
    assert await File.get(PydanticObjectId(f["id"])) is None


# --- Subfolder-level Mid-way changes ---------------------------------------------------------------------------------------------
def changes(sub):
    return f"/subfolders/{sub.id}/changes"


async def test_subfolder_mid_way_changes(client, team):
    r = await client.post(changes(team.design), json={"kind": "change_request", "body": "<p>Switch the whole palette</p>"}, headers=team.max.headers)
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["task_id"] is None and e["subfolder_id"] == str(team.design.id)
    assert len(await notes("change_request", team.hana)) == 1  # the head
    assert (await notes("change_request", team.hana))[0].link == f"/app/projects/{team.project.id}/subfolders/{team.design.id}?entry={e['id']}"

    # Design is private: Vic (head of Video, same project) cannot post or read here, and nor can anyone outside it
    assert (await client.post(changes(team.design), json={"kind": "change_request", "body": "<p>ok</p>"}, headers=team.vic.headers)).status_code == 403
    assert (await client.get(changes(team.design), headers=team.ollie.headers)).status_code == 403
    assert (await client.post(changes(team.design), json={"kind": "change_request", "body": "<p>x</p>"}, headers=team.cleo.headers)).status_code == 403
    assert (await client.post(changes(team.design), json={"kind": "comment", "body": "<p>x</p>"}, headers=team.max.headers)).status_code == 422

    listed = (await client.get(changes(team.design), headers=team.mia.headers)).json()
    assert listed["unresolved"] == 1 and len(listed["items"]) == 1 and listed["can_post"] is True

    assert (await client.put(f"/activity/{e['id']}/resolved", json={"resolved": True}, headers=team.mia.headers)).status_code == 403  # a plain member
    assert (await client.put(f"/activity/{e['id']}/resolved", json={"resolved": True}, headers=team.hana.headers)).status_code == 200  # the head
    assert (await client.get(changes(team.design), headers=team.mia.headers)).json()["unresolved"] == 0
    open_only = (await client.get(changes(team.design), params={"open_only": True}, headers=team.mia.headers)).json()
    assert len(open_only["items"]) == 0
    assert (await client.get(changes(team.video), headers=team.mia.headers)).status_code == 403  # per subfolder, and Video is private


async def test_subfolder_changes_stay_apart_from_task_ones(client, team):
    t = await make_task(client, team)
    await post(client, team.max, t)
    assert (await client.get(changes(team.design), headers=team.mia.headers)).json()["items"] == []
    assert (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()["unresolved_changes"] == 1


# --- Message -> task -----------------------------------------------------------------------------------------------------------------
async def make_from(client, who, message, *, sub, assignee=None, **extra):
    assignee = assignee or who
    return await client.post(
        "/tasks",
        json={
            "subfolder_id": str(sub.id), "title": "From chat", "description": "Text of the message", "assignee_id": assignee.id,
            "from_message_id": message["id"], **extra,
        },
        headers=who.headers,
    )


async def test_a_message_becomes_a_task_and_both_point_at_each_other(client, team, live):
    g = await group(client, team.mia, team.hana, team.max, name="Design chat")
    m = await sent(client, team.hana, g, "Please fix the footer")
    r = await make_from(client, team.mia, m, sub=team.design)
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["source"] == {"group_id": g["id"], "group_name": "Design chat", "message_id": m["id"]}
    assert [text for _, text in await log_lines(client, team.mia, t)] == ["created this task from a chat message"]

    # the message shows a "Task created" chip, live for everyone in the group
    page = (await client.get(f"/chat/groups/{g['id']}/messages", headers=team.max.headers)).json()["items"]
    assert page[0]["task"] == {"id": t["id"], "title": "From chat"}
    updates = live.events("chat:message_update")
    assert updates and updates[-1][1]["task"]["id"] == t["id"] and team.max.id in {str(i) for i in updates[-1][0]}

    # only the people in that chat see where it came from
    assert (await client.get(f"/tasks/{t['id']}", headers=team.hana.headers)).json()["source"]["message_id"] == m["id"]
    await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.vic.id}, headers=team.admin.headers)
    assert (await client.get(f"/tasks/{t['id']}", headers=team.vic.headers)).json()["source"] is None


async def test_one_task_per_message_and_only_for_people_in_the_chat(client, team):
    g = await group(client, team.mia, team.hana)
    m = await sent(client, team.hana, g, "Do the thing")
    assert (await make_from(client, team.ollie, m, sub=team.elsewhere)).status_code == 403  # not in the chat
    assert (await make_from(client, team.mia, m, sub=team.design)).status_code == 201
    assert (await make_from(client, team.hana, m, sub=team.design, assignee=team.mia)).status_code == 409
    assert await Task.find_all().count() == 1
    missing = {"id": str(PydanticObjectId())}
    assert (await make_from(client, team.mia, missing, sub=team.design)).status_code == 404


async def test_assign_rules_still_apply_to_tasks_from_chat(client, team):
    g = await group(client, team.mia, team.max)
    m = await sent(client, team.mia, g, "Someone should do this")
    assert (await make_from(client, team.mia, m, assignee=team.max, sub=team.design)).status_code == 403  # employees assign only themselves
    assert (await ChatMessage.get(PydanticObjectId(m["id"]))).task_id is None  # nothing was claimed
    assert (await make_from(client, team.hana, m, assignee=team.max, sub=team.design)).status_code == 403  # Hana isn't in this chat
    assert (await make_from(client, team.mia, m, assignee=team.mia, sub=team.design)).status_code == 201


async def test_the_messages_file_is_copied_as_an_independent_attachment(client, team):
    g = await group(client, team.mia, team.hana)
    f = await upload(client, team.hana, "brief.pdf", b"PDFDATA", "application/pdf")
    m = await sent(client, team.hana, g, "", type="file", file_id=f["id"])
    t = (await make_from(client, team.mia, m, sub=team.design)).json()
    assert [a["name"] for a in t["assets"]] == ["brief.pdf"] and t["assets"][0]["id"] != f["id"]
    copy = await File.get(PydanticObjectId(t["assets"][0]["id"]))
    assert str(copy.owner_id) == team.mia.id and copy.storage_key != (await File.get(PydanticObjectId(f["id"]))).storage_key

    await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.hana.headers)  # the original goes to the Trash
    await purge(await TrashItem.find_one())  # and is later removed for good
    assert await File.get(PydanticObjectId(f["id"])) is None
    download = await client.get(t["assets"][0]["url"].replace("/api/v1", ""), headers=team.mia.headers)
    assert download.status_code == 200 and download.content == b"PDFDATA"


async def test_deleting_the_task_removes_the_chip(client, team, live):
    g = await group(client, team.mia, team.hana)
    m = await sent(client, team.hana, g, "Do it")
    t = (await make_from(client, team.mia, m, sub=team.design)).json()
    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 204
    assert (await ChatMessage.get(PydanticObjectId(m["id"]))).task_id is None
    assert live.events("chat:message_update")[-1][1]["task"] is None
    assert (await make_from(client, team.mia, m, sub=team.design)).status_code == 201  # it can become a task again


async def test_deleted_or_hidden_messages_cant_become_tasks(client, team):
    g = await group(client, team.mia, team.hana)
    gone = await sent(client, team.hana, g, "oops")
    await client.delete(f"/chat/messages/{gone['id']}", params={"scope": "everyone"}, headers=team.hana.headers)
    assert (await make_from(client, team.mia, gone, sub=team.design)).status_code == 409
    hidden = await sent(client, team.hana, g, "mine only")
    await client.delete(f"/chat/messages/{hidden['id']}", params={"scope": "me"}, headers=team.mia.headers)
    assert (await make_from(client, team.mia, hidden, sub=team.design)).status_code == 404


async def test_a_group_delete_leaves_tasks_alone(client, team):
    g = await group(client, team.mia, team.hana)
    m = await sent(client, team.hana, g, "Do it")
    t = (await make_from(client, team.mia, m, sub=team.design)).json()
    assert (await client.delete(f"/chat/groups/{g['id']}", headers=team.mia.headers)).status_code == 204
    again = (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()
    assert again["source"] is None  # the chat is gone, so there is nothing to jump to
    assert await ChatGroup.find_all().count() == 0
