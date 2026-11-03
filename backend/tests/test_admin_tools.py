"""Phase 10e, the Admin side: workspace settings, companies, CSV export, and the Trash."""
import csv
import io
from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId

from app.core.timeutil import today_local, tz
from app.models import (
    ChatGroup,
    ChatMessage,
    ChecklistItem,
    Company,
    DailyStatus,
    DeliverablePlan,
    File,
    Project,
    Requirement,
    Subfolder,
    Task,
    TaskActivity,
    TrashItem,
    User,
)
from app.models.deliverable import DeliverableItem
from app.services.trash import purge_expired
from tests.test_chat import group, live, sent, upload  # noqa: F401  (live is a fixture)
from tests.test_tasks import make_task, team  # noqa: F401  (team is a fixture)


def rows_of(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    return list(csv.reader(io.StringIO(text[1:])))


# --- Workspace ------------------------------------------------------------------------------------------------------------
async def test_workspace_defaults_and_who_may_change_it(client, team):
    w = (await client.get("/workspace", headers=team.mia.headers)).json()
    assert w == {"name": "Task Manager", "logo_url": None, "work_start": "09:00", "work_end": "18:00", "holidays": [], "weekly_off": [6]}
    assert (await client.get("/workspace", headers=team.cleo.headers)).status_code == 200  # clients read it too
    assert (await client.get("/workspace")).status_code == 401
    assert (await client.put("/workspace", json={"name": "X"}, headers=team.mia.headers)).status_code == 403
    assert (await client.post("/workspace/holidays", json={"date": "2030-01-01", "name": "New Year"}, headers=team.mia.headers)).status_code == 403

    r = await client.put("/workspace", json={"name": "  Piixel   Studio ", "work_start": "10:00", "work_end": "19:30"}, headers=team.admin.headers)
    assert r.status_code == 200, r.text
    assert (r.json()["name"], r.json()["work_start"], r.json()["work_end"]) == ("Piixel Studio", "10:00", "19:30")
    assert (await client.get("/workspace", headers=team.mia.headers)).json()["name"] == "Piixel Studio"
    assert (await client.put("/workspace", json={"work_start": "20:00", "work_end": "09:00"}, headers=team.admin.headers)).status_code == 422
    assert (await client.put("/workspace", json={"work_start": "9am"}, headers=team.admin.headers)).status_code == 422
    assert (await client.put("/workspace", json={"name": ""}, headers=team.admin.headers)).status_code == 422


async def test_logo_can_be_set_replaced_and_removed(client, team):
    one = await upload(client, team.admin, "logo.png", b"one", "image/png")
    r = await client.put("/workspace", json={"logo_file_id": one["id"]}, headers=team.admin.headers)
    assert r.status_code == 200 and r.json()["logo_url"] == f"/api/v1/files/{one['id']}/download"

    two = await upload(client, team.admin, "logo2.png", b"two", "image/png")
    await client.put("/workspace", json={"logo_file_id": two["id"]}, headers=team.admin.headers)
    assert await File.get(PydanticObjectId(one["id"])) is None  # the old logo is cleaned up
    assert await File.get(PydanticObjectId(two["id"])) is not None

    doc = await upload(client, team.admin, "x.pdf", b"x", "application/pdf")
    assert (await client.put("/workspace", json={"logo_file_id": doc["id"]}, headers=team.admin.headers)).status_code == 422
    theirs = await upload(client, team.mia, "m.png", b"m", "image/png")
    assert (await client.put("/workspace", json={"logo_file_id": theirs["id"]}, headers=team.admin.headers)).status_code == 422

    r = await client.put("/workspace", json={"remove_logo": True}, headers=team.admin.headers)
    assert r.json()["logo_url"] is None and await File.get(PydanticObjectId(two["id"])) is None


async def test_holidays(client, team):
    h = team.admin.headers
    r = await client.post("/workspace/holidays", json={"date": "2030-12-25", "name": " Christmas  Day ", "type": "national"}, headers=h)
    assert r.status_code == 201, r.text
    await client.post("/workspace/holidays", json={"date": "2030-01-01", "name": "New Year"}, headers=h)
    listed = (await client.get("/workspace", headers=team.mia.headers)).json()["holidays"]
    assert [(x["date"], x["name"], x["type"]) for x in listed] == [("2030-01-01", "New Year", "company"), ("2030-12-25", "Christmas Day", "national")]  # by date
    assert (await client.post("/workspace/holidays", json={"date": "2030-12-25", "name": "christmas day"}, headers=h)).status_code == 409
    assert (await client.post("/workspace/holidays", json={"date": "25/12/2030", "name": "X"}, headers=h)).status_code == 422
    assert (await client.post("/workspace/holidays", json={"date": "2030-02-02", "name": "X", "type": "weird"}, headers=h)).status_code == 422

    assert (await client.delete(f"/workspace/holidays/{listed[0]['id']}", headers=h)).status_code == 200
    assert (await client.delete(f"/workspace/holidays/{listed[0]['id']}", headers=h)).status_code == 404
    assert len((await client.get("/workspace", headers=h)).json()["holidays"]) == 1


async def test_bookable_all_day_and_holidays_follow_the_workspace(client, team):
    day = today_local() + timedelta(days=3)

    def local_hours(slots):
        return [datetime.fromisoformat(s["start"]).astimezone(tz()).strftime("%H:%M") for s in slots]

    async def slots(minutes=30):
        r = await client.get("/bookings/availability", params={"host_user_id": team.mia.id, "date": day.isoformat(), "minutes": minutes}, headers=team.max.headers)
        assert r.status_code == 200, r.text
        return r.json()

    all_day = local_hours((await slots())["slots"])
    assert all_day[0] == "00:00" and all_day[-1] == "23:30" and len(all_day) == 48  # no after-hours limit
    await client.put("/workspace", json={"work_start": "10:00", "work_end": "12:00"}, headers=team.admin.headers)
    assert local_hours((await slots())["slots"]) == all_day  # the office hours setting no longer limits bookings

    # holidays are shown on calendars, not enforced: bookings stay open on them
    await client.post("/workspace/holidays", json={"date": day.isoformat(), "name": "Founders Day", "type": "company"}, headers=team.admin.headers)
    assert len((await slots())["slots"]) == 48


# --- Companies --------------------------------------------------------------------------------------------------------------------
async def test_companies_are_managed_by_admins(client, team):
    h = team.admin.headers
    r = await client.post("/companies", json={"name": "  Unwork  "}, headers=h)
    assert r.status_code == 201 and r.json()["name"] == "Unwork"
    assert (await client.post("/companies", json={"name": "unwork"}, headers=h)).status_code == 409
    assert (await client.post("/companies", json={"name": "  "}, headers=h)).status_code == 422
    assert (await client.post("/companies", json={"name": "Nope"}, headers=team.mia.headers)).status_code == 403
    assert [c["name"] for c in (await client.get("/companies", headers=team.mia.headers)).json()] == ["Piixel", "Unwork"]

    cid = r.json()["id"]
    assert (await client.patch(f"/companies/{cid}", json={"name": "Piixel"}, headers=h)).status_code == 409
    assert (await client.patch(f"/companies/{cid}", json={"name": "Unwork Studios"}, headers=h)).json()["name"] == "Unwork Studios"
    assert (await client.patch(f"/companies/{PydanticObjectId()}", json={"name": "Z"}, headers=h)).status_code == 404
    assert (await client.patch(f"/companies/{cid}", json={"name": "Q"}, headers=team.mia.headers)).status_code == 403

    assert (await client.delete(f"/companies/{cid}", headers=team.mia.headers)).status_code == 403
    assert (await client.delete(f"/companies/{cid}", headers=h)).status_code == 204
    assert (await client.delete(f"/companies/{cid}", headers=h)).status_code == 404


async def test_a_company_in_use_cant_be_deleted(client, team):
    piixel = await Company.find_one(Company.name == "Piixel")  # the team fixture's project belongs to it
    r = await client.delete(f"/companies/{piixel.id}", headers=team.admin.headers)
    assert r.status_code == 409 and "0 people and 2 projects" in r.json()["detail"]
    await User.find({"_id": team.mia.user.id}).update({"$set": {"company_id": piixel.id}})
    assert "1 person and 2 projects" in (await client.delete(f"/companies/{piixel.id}", headers=team.admin.headers)).json()["detail"]
    assert await Company.get(piixel.id) is not None


# --- Export ---------------------------------------------------------------------------------------------------------------------------
async def test_tasks_export(client, team):
    t = await make_task(client, team, title="=HYPERLINK(\"http://evil\")", due_date="2030-05-05")
    await make_task(client, team, assignee=team.max, title="Normal, with comma")
    await Task.find({"_id": PydanticObjectId(t["id"])}).update({"$set": {"status": "approved", "progress": 100, "total_seconds": 5400}})

    rows = rows_of(await client.get("/export/tasks.csv", headers=team.admin.headers))
    assert rows[0] == ["id", "title", "project", "subfolder", "assignee", "status", "priority", "due_date", "progress_percent", "hours_tracked", "created"]
    assert len(rows) == 3
    by_title = {r[1]: r for r in rows[1:]}
    formula = by_title["'=HYPERLINK(\"http://evil\")"]  # defused: a spreadsheet won't run it
    assert formula[2:10] == ["Acme", "Design", "Mia Member", "approved", "medium", "2030-05-05", "100", "1.5"]
    assert by_title["Normal, with comma"][4] == "Max Member"  # commas are quoted properly

    only = rows_of(await client.get("/export/tasks.csv", params={"status": "approved"}, headers=team.admin.headers))
    assert len(only) == 2
    today = today_local().isoformat()
    assert len(rows_of(await client.get("/export/tasks.csv", params={"created_from": today, "created_to": today}, headers=team.admin.headers))) == 3
    assert len(rows_of(await client.get("/export/tasks.csv", params={"created_to": "2000-01-01"}, headers=team.admin.headers))) == 1
    assert len(rows_of(await client.get("/export/tasks.csv", params={"project_id": str(team.project.id)}, headers=team.admin.headers))) == 3
    assert len(rows_of(await client.get("/export/tasks.csv", params={"project_id": str(PydanticObjectId())}, headers=team.admin.headers))) == 1
    assert (await client.get("/export/tasks.csv", params={"project_id": "nope"}, headers=team.admin.headers)).status_code == 422
    assert (await client.get("/export/tasks.csv", params={"created_from": "yesterday"}, headers=team.admin.headers)).status_code == 422


async def test_status_export(client, team):
    for who, day, st in ((team.mia, "2030-03-01", "present"), (team.max, "2030-03-02", "leave"), (team.mia, "2030-04-01", "wfh")):
        await DailyStatus(user_id=who.user.id, date=day, status=st).insert()
    rows = rows_of(await client.get("/export/status.csv", headers=team.admin.headers))
    assert rows[0] == ["date", "person", "email", "status"] and [r[0] for r in rows[1:]] == ["2030-03-01", "2030-03-02", "2030-04-01"]
    march = rows_of(await client.get("/export/status.csv", params={"date_from": "2030-03-01", "date_to": "2030-03-31"}, headers=team.admin.headers))
    assert [(r[0], r[1], r[3]) for r in march[1:]] == [("2030-03-01", "Mia Member", "present"), ("2030-03-02", "Max Member", "leave")]


async def test_deliverables_export(client, team):
    await DeliverablePlan(
        subfolder_id=team.design.id,
        month="2030-06",
        items=[DeliverableItem(id="a", type="Reels", number=1, title="Reels 1", stage="editing"), DeliverableItem(id="b", type="Reels", number=2, title="Reels 2")],
    ).insert()
    await DeliverablePlan(subfolder_id=team.design.id, month="2030-07", items=[DeliverableItem(id="c", type="Posts", number=1, title="Posts 1", stage="posted")]).insert()
    rows = rows_of(await client.get("/export/deliverables.csv", headers=team.admin.headers))
    assert rows[0] == ["month", "project", "subfolder", "type", "number", "title", "stage"] and len(rows) == 4
    assert rows[1] == ["2030-06", "Acme", "Design", "Reels", "1", "Reels 1", "Editing"]
    assert len(rows_of(await client.get("/export/deliverables.csv", params={"month": "2030-07"}, headers=team.admin.headers))) == 2
    assert (await client.get("/export/deliverables.csv", params={"month": "June"}, headers=team.admin.headers)).status_code == 422


async def test_exports_are_for_admins_only(client, team):
    for path in ("tasks", "status", "deliverables"):
        assert (await client.get(f"/export/{path}.csv", headers=team.hana.headers)).status_code == 403
        assert (await client.get(f"/export/{path}.csv", headers=team.cleo.headers)).status_code == 403
        assert (await client.get(f"/export/{path}.csv")).status_code == 401


# --- Trash ---------------------------------------------------------------------------------------------------------------------------------
async def items(client, team, **params):
    r = await client.get("/trash", params=params, headers=team.admin.headers)
    assert r.status_code == 200, r.text
    return r.json()["items"]


async def test_a_deleted_task_waits_in_the_trash_and_comes_back_whole(client, team):
    f = await upload(client, team.hana, "brief.pdf", b"pdf", "application/pdf")
    t = await make_task(client, team, asset_ids=[f["id"]])
    await client.post(f"/tasks/{t['id']}/activity", json={"kind": "comment", "body": "<p>Hello</p>"}, headers=team.max.headers)
    await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)

    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 204
    assert await Task.find_all().count() == 0 and await TaskActivity.find_all().count() == 0
    assert await File.get(PydanticObjectId(f["id"])) is not None  # its files are kept for now

    listed = await items(client, team)
    assert len(listed) == 1
    item = listed[0]
    assert (item["kind"], item["title"], item["context"], item["deleted_by"]["id"]) == ("task", t["title"], "Acme › Design", team.hana.id)
    assert item["days_left"] in (29, 30)

    r = await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)
    assert r.status_code == 200 and r.json() == {"restored": "task"}
    back = (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()  # the same id, the same people
    assert back["title"] == t["title"] and back["assets"][0]["id"] == f["id"] and back["assignee"]["id"] == team.mia.id
    acts = (await client.get(f"/tasks/{t['id']}/activity", headers=team.mia.headers)).json()["items"]
    assert any(a["kind"] == "comment" for a in acts) and any(a["kind"] == "log" for a in acts)
    assert (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()["timer_running"] is False  # a timer doesn't resume
    assert await items(client, team) == []
    assert (await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)).status_code == 404


async def test_only_admins_use_the_trash(client, team):
    t = await make_task(client, team)
    await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)
    item = (await items(client, team))[0]
    for who in (team.hana, team.mia, team.cleo):
        assert (await client.get("/trash", headers=who.headers)).status_code == 403
        assert (await client.post(f"/trash/{item['id']}/restore", headers=who.headers)).status_code == 403
        assert (await client.delete(f"/trash/{item['id']}", headers=who.headers)).status_code == 403
    assert (await client.get("/trash")).status_code == 401


async def test_a_deleted_subfolder_returns_with_its_work(client, team):
    t = await make_task(client, team)
    await ChecklistItem(subfolder_id=team.design.id, text="Pick fonts", created_by=team.mia.user.id).insert()
    await DeliverablePlan(subfolder_id=team.design.id, month="2030-06", items=[]).insert()
    req = await Requirement(project_id=team.project.id, subfolder_id=team.design.id, title="Colours", created_by=team.admin.user.id).insert()
    chat = await ChatGroup(name="Design chat", member_ids=[team.mia.user.id], subfolder_id=team.design.id, created_by=team.mia.user.id).insert()
    await client.post(f"/subfolders/{team.design.id}/changes", json={"kind": "change_request", "body": "<p>Rethink</p>"}, headers=team.max.headers)

    assert (await client.delete(f"/subfolders/{team.design.id}", headers=team.hana.headers)).status_code == 204
    assert await Subfolder.get(team.design.id) is None and await ChecklistItem.find_all().count() == 0
    assert (await Requirement.get(req.id)).subfolder_id is None

    item = (await items(client, team, kind="subfolder"))[0]
    assert (item["title"], item["context"]) == ("Design", "Acme")
    assert (await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)).json() == {"restored": "subfolder"}

    assert (await Subfolder.get(team.design.id)).member_ids == [team.hana.user.id, team.mia.user.id, team.max.user.id]
    assert await Task.get(PydanticObjectId(t["id"])) is not None and await ChecklistItem.find_all().count() == 1
    assert await DeliverablePlan.find_all().count() == 1 and await TaskActivity.find_all().count() >= 2
    assert (await Requirement.get(req.id)).subfolder_id == team.design.id  # re-tagged
    assert (await ChatGroup.get(chat.id)).subfolder_id == team.design.id  # re-linked


async def test_restoring_needs_the_place_it_lived_in(client, team):
    t = await make_task(client, team)
    await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)
    await client.delete(f"/subfolders/{team.design.id}", headers=team.admin.headers)
    task_item = (await items(client, team, kind="task"))[0]
    r = await client.post(f"/trash/{task_item['id']}/restore", headers=team.admin.headers)
    assert r.status_code == 409 and "subfolder" in r.json()["detail"]

    sub_item = (await items(client, team, kind="subfolder"))[0]
    await client.post(f"/trash/{sub_item['id']}/restore", headers=team.admin.headers)
    assert (await client.post(f"/trash/{task_item['id']}/restore", headers=team.admin.headers)).status_code == 200  # now it has somewhere to go
    assert (await client.get(f"/tasks/{t['id']}", headers=team.admin.headers)).status_code == 200


async def test_a_deleted_project_returns_with_everything(client, team):
    t = await make_task(client, team)
    await Requirement(project_id=team.project.id, title="Brand book", created_by=team.admin.user.id).insert()
    assert (await client.delete(f"/projects/{team.project.id}", headers=team.admin.headers)).status_code == 204
    assert await Project.get(team.project.id) is None and await Subfolder.find({"project_id": team.project.id}).count() == 0
    assert await Requirement.find_all().count() == 0 and await Task.find_all().count() == 0

    item = (await items(client, team, kind="project"))[0]
    assert item["title"] == "Acme"
    assert (await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)).json() == {"restored": "project"}
    assert await Subfolder.find({"project_id": team.project.id}).count() == 2
    assert await Requirement.find_all().count() == 1 and (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).status_code == 200
    assert (await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)).status_code == 404


async def test_a_message_deleted_for_everyone_can_be_restored(client, team, live):
    g = await group(client, team.mia, team.hana)
    f = await upload(client, team.mia, "pic.png", b"png", "image/png")
    m = await sent(client, team.mia, g, "Secret plans", type="image", file_id=f["id"])
    assert (await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.mia.headers)).status_code == 204
    gone = (await client.get(f"/chat/groups/{g['id']}/messages", headers=team.hana.headers)).json()["items"][0]
    assert gone["deleted"] is True and gone["body"] == "" and gone["file"] is None
    assert await File.get(PydanticObjectId(f["id"])) is not None  # kept while it is in the trash

    item = (await items(client, team, kind="message"))[0]
    assert (item["title"], item["context"], item["deleted_by"]["id"]) == ("Secret plans", "Design chat", team.mia.id)
    assert (await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)).json() == {"restored": "message"}
    back = (await client.get(f"/chat/groups/{g['id']}/messages", headers=team.hana.headers)).json()["items"][0]
    assert back["deleted"] is False and back["text"] == "Secret plans" and back["file"]["id"] == f["id"]
    assert live.events("chat:message_update")[-1][1]["deleted"] is False  # the group sees it return


async def test_a_forwarded_file_survives_deleting_the_original_for_everyone(client, team):
    g = await group(client, team.mia, team.hana)
    f = await upload(client, team.mia, "pic.png", b"png", "image/png")
    original = await sent(client, team.mia, g, "", type="image", file_id=f["id"])
    copy = (await client.post(f"/chat/messages/{original['id']}/forward", json={"group_ids": [g["id"]]}, headers=team.mia.headers)).json()[0]
    await client.delete(f"/chat/messages/{original['id']}", params={"scope": "everyone"}, headers=team.mia.headers)
    await client.delete(f"/chat/messages/{copy['id']}", params={"scope": "everyone"}, headers=team.mia.headers)
    assert await File.get(PydanticObjectId(f["id"])) is not None  # both are in the trash, which still needs it
    item = (await items(client, team, kind="message"))[0]
    await client.delete(f"/trash/{item['id']}", headers=team.admin.headers)
    assert await File.get(PydanticObjectId(f["id"])) is not None  # the other one still needs it
    await client.delete(f"/trash/{(await items(client, team, kind='message'))[0]['id']}", headers=team.admin.headers)
    assert await File.get(PydanticObjectId(f["id"])) is None  # nothing does now


async def test_deleting_forever_removes_the_files_too(client, team):
    f = await upload(client, team.hana, "brief.pdf", b"pdf", "application/pdf")
    t = await make_task(client, team, asset_ids=[f["id"]])
    await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)
    item = (await items(client, team))[0]
    assert (await client.delete(f"/trash/{item['id']}", headers=team.admin.headers)).status_code == 204
    assert await File.get(PydanticObjectId(f["id"])) is None and await TrashItem.find_all().count() == 0
    assert (await client.delete(f"/trash/{item['id']}", headers=team.admin.headers)).status_code == 404


async def test_items_are_purged_after_thirty_days(client, team):
    f = await upload(client, team.hana, "brief.pdf", b"pdf", "application/pdf")
    old = await make_task(client, team, asset_ids=[f["id"]])
    new = await make_task(client, team, title="Fresh one")
    await client.delete(f"/tasks/{old['id']}", headers=team.hana.headers)
    await client.delete(f"/tasks/{new['id']}", headers=team.hana.headers)

    stale = await TrashItem.find_one(TrashItem.title == old["title"])
    assert (stale.expires_at - stale.deleted_at).days == 30
    await TrashItem.find({"_id": stale.id}).update({"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}})

    assert await purge_expired() == 1
    assert [i["title"] for i in await items(client, team)] == ["Fresh one"]
    assert await File.get(PydanticObjectId(f["id"])) is None
    assert await purge_expired() == 0


async def test_listing_the_trash_clears_out_expired_items(client, team):
    t = await make_task(client, team)
    await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)
    await TrashItem.find_all().update({"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(days=1)}})
    assert await items(client, team) == [] and await TrashItem.find_all().count() == 0


async def test_deleting_a_chat_group_purges_its_trashed_messages(client, team):
    g = await group(client, team.mia, team.hana)
    f = await upload(client, team.mia, "pic.png", b"png", "image/png")
    m = await sent(client, team.mia, g, "", type="image", file_id=f["id"])
    await client.delete(f"/chat/messages/{m['id']}", params={"scope": "everyone"}, headers=team.mia.headers)
    assert await TrashItem.find_all().count() == 1
    assert (await client.delete(f"/chat/groups/{g['id']}", headers=team.mia.headers)).status_code == 204
    assert await TrashItem.find_all().count() == 0 and await File.get(PydanticObjectId(f["id"])) is None
    assert await ChatMessage.find_all().count() == 0


async def test_restoring_a_task_relinks_its_chat_chip(client, team, live):
    g = await group(client, team.mia, team.hana)
    m = await sent(client, team.hana, g, "Please fix the footer")
    body = {"subfolder_id": str(team.design.id), "title": "Footer", "description": "Fix it", "assignee_id": team.mia.id, "from_message_id": m["id"]}
    task = (await client.post("/tasks", json=body, headers=team.mia.headers)).json()
    await client.delete(f"/tasks/{task['id']}", headers=team.hana.headers)
    assert (await ChatMessage.get(PydanticObjectId(m["id"]))).task_id is None
    item = (await items(client, team, kind="task"))[0]
    await client.post(f"/trash/{item['id']}/restore", headers=team.admin.headers)
    assert str((await ChatMessage.get(PydanticObjectId(m["id"]))).task_id) == task["id"]  # the "Task created" chip is back
    assert live.events("chat:message_update")[-1][1]["task"]["id"] == task["id"]


async def test_holidays_take_single_dates_ranges_and_companies(client, team):
    h = team.admin.headers
    d = [today_local() + timedelta(days=n) for n in (4, 5, 6, 10)]
    iso = [x.isoformat() for x in d]
    company = (await client.post("/companies", json={"name": "Hols Co"}, headers=h)).json()["id"]

    r = await client.post(
        "/workspace/holidays",
        json={"dates": [iso[0], iso[3], iso[0]], "ranges": [{"start": iso[1], "end": iso[2]}], "name": "Diwali", "type": "company", "company_ids": [company]},
        headers=h,
    )
    assert r.status_code == 201
    listed = r.json()["holidays"]
    assert [(x["date"], x["end_date"]) for x in listed] == [(iso[0], None), (iso[1], iso[2]), (iso[3], None)]
    assert all(x["name"] == "Diwali" and x["company_ids"] == [company] for x in listed)

    # entries already listed are skipped; nothing new is a conflict; bad input is rejected
    r = await client.post("/workspace/holidays", json={"dates": [iso[0]], "ranges": [{"start": iso[1], "end": iso[2]}], "name": "Diwali", "company_ids": [company]}, headers=h)
    assert r.status_code == 409
    assert (await client.post("/workspace/holidays", json={"name": "No date"}, headers=h)).status_code == 422
    assert (await client.post("/workspace/holidays", json={"dates": ["nope"], "name": "Bad"}, headers=h)).status_code == 422
    assert (await client.post("/workspace/holidays", json={"ranges": [{"start": iso[2], "end": iso[1]}], "name": "Bad"}, headers=h)).status_code == 422
    assert (await client.post("/workspace/holidays", json={"dates": [iso[0]], "name": "Bad", "company_ids": ["64b000000000000000000000"]}, headers=h)).status_code == 422
    assert (await client.post("/workspace/holidays", json={"dates": [iso[0]], "name": "X"}, headers=team.mia.headers)).status_code == 403

    # no company listed = both companies; the calendar side never blocks a booking
    both = (await client.post("/workspace/holidays", json={"dates": [iso[0]], "name": "Founders Day"}, headers=h)).json()["holidays"]
    assert [x for x in both if x["name"] == "Founders Day"][0]["company_ids"] == []
    av = (await client.get("/bookings/availability", params={"host_user_id": team.mia.id, "date": iso[0]}, headers=team.max.headers)).json()
    assert len(av["slots"]) == 48


async def test_holiday_edit_and_delete(client, team):
    h = team.admin.headers
    day = today_local() + timedelta(days=7)
    created = (await client.post("/workspace/holidays", json={"dates": [day.isoformat()], "name": "Trip"}, headers=h)).json()["holidays"][0]
    hid = created["id"]
    end = (day + timedelta(days=2)).isoformat()
    r = await client.patch(f"/workspace/holidays/{hid}", json={"name": "Team trip", "end_date": end, "type": "optional"}, headers=h)
    assert r.status_code == 200
    got = r.json()["holidays"][0]
    assert (got["name"], got["end_date"], got["type"]) == ("Team trip", end, "optional")
    r = await client.patch(f"/workspace/holidays/{hid}", json={"end_date": ""}, headers=h)
    assert r.json()["holidays"][0]["end_date"] is None
    assert (await client.patch(f"/workspace/holidays/{hid}", json={"end_date": (day - timedelta(days=1)).isoformat()}, headers=h)).status_code == 422
    assert (await client.patch("/workspace/holidays/nope", json={"name": "x"}, headers=h)).status_code == 404
    assert (await client.patch(f"/workspace/holidays/{hid}", json={"name": "x"}, headers=team.mia.headers)).status_code == 403
    assert (await client.delete(f"/workspace/holidays/{hid}", headers=h)).json()["holidays"] == []


async def test_weekly_off_defaults_to_sunday_and_is_validated(client, team):
    h = team.admin.headers
    assert (await client.get("/workspace", headers=team.mia.headers)).json()["weekly_off"] == [6]
    r = await client.put("/workspace", json={"weekly_off": [5, 6, 5]}, headers=h)
    assert r.status_code == 200 and r.json()["weekly_off"] == [5, 6]
    assert (await client.put("/workspace", json={"weekly_off": [7]}, headers=h)).status_code == 422
    assert (await client.put("/workspace", json={"weekly_off": [0]}, headers=team.mia.headers)).status_code == 403
    assert (await client.put("/workspace", json={"weekly_off": []}, headers=h)).json()["weekly_off"] == []


async def test_workspace_changes_reach_everyone_live(client, team, monkeypatch):
    sent = []

    async def fake(user_ids, event, data):
        sent.append((set(user_ids), event))

    monkeypatch.setattr("app.routers.workspace.manager.send_to_users", fake)
    await client.put("/workspace", json={"weekly_off": [6]}, headers=team.admin.headers)
    day = (today_local() + timedelta(days=9)).isoformat()
    hid = (await client.post("/workspace/holidays", json={"dates": [day], "name": "Live"}, headers=team.admin.headers)).json()["holidays"][0]["id"]
    await client.patch(f"/workspace/holidays/{hid}", json={"name": "Live 2"}, headers=team.admin.headers)
    await client.delete(f"/workspace/holidays/{hid}", headers=team.admin.headers)
    assert [e for _, e in sent] == ["workspace"] * 4 and team.mia.user.id in sent[0][0]
