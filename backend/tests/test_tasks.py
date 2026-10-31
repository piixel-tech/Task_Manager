from datetime import timedelta
from types import SimpleNamespace

import pytest_asyncio

from app.core.timeutil import today_local
from app.models import Company, File, Notification, Project, Subfolder, Task, TimeLog
from app.services.reminders import run_reminders
from app.services.tasks import now_utc


def day(offset: int = 0) -> str:
    return (today_local() + timedelta(days=offset)).isoformat()


@pytest_asyncio.fixture
async def team(make_user):
    """Design (head Hana; members Mia, Max) and Video (head Vic) in one project, plus an outsider and a client."""
    admin = await make_user("admin", "Ada Admin")
    hana = await make_user("employee", "Hana Head")
    mia = await make_user("employee", "Mia Member")
    max_ = await make_user("employee", "Max Member")
    vic = await make_user("employee", "Vic Video")
    ollie = await make_user("employee", "Ollie Outsider")
    cleo = await make_user("client", "Cleo Client")

    company = await Company(name="Piixel").insert()
    project = await Project(name="Acme", company_id=company.id, created_by=admin.user.id).insert()
    ids = lambda *p: [x.user.id for x in p]  # noqa: E731
    design = await Subfolder(
        project_id=project.id, name="Design", head_ids=ids(hana), member_ids=ids(hana, mia, max_), created_by=admin.user.id
    ).insert()
    video = await Subfolder(
        project_id=project.id, name="Video", head_ids=ids(vic), member_ids=ids(vic), created_by=admin.user.id
    ).insert()
    other = await Project(name="Other", company_id=company.id, created_by=admin.user.id).insert()
    elsewhere = await Subfolder(
        project_id=other.id, name="Elsewhere", head_ids=ids(ollie), member_ids=ids(ollie), created_by=admin.user.id
    ).insert()
    return SimpleNamespace(
        admin=admin, hana=hana, mia=mia, max=max_, vic=vic, ollie=ollie, cleo=cleo,
        project=project, design=design, video=video, elsewhere=elsewhere,
    )


async def create(client, who, sub, assignee, **extra):
    body = {
        "subfolder_id": str(sub.id),
        "title": "Write homepage copy",
        "description": "Hero section and three feature blurbs.",
        "assignee_id": assignee.id,
        **extra,
    }
    return await client.post("/tasks", json=body, headers=who.headers)


async def make_task(client, team, assignee=None, **extra):
    r = await create(client, team.hana, team.design, assignee or team.mia, **extra)
    assert r.status_code == 201, r.text
    return r.json()


# --- Creating: validation ---------------------------------------------------------------------------
async def test_requires_login(client):
    assert (await client.get("/tasks")).status_code == 401


async def test_description_is_required(client, team):
    base = {"subfolder_id": str(team.design.id), "title": "T", "assignee_id": team.mia.id}
    for payload in (base, {**base, "description": ""}, {**base, "description": "   "}):
        r = await client.post("/tasks", json=payload, headers=team.hana.headers)
        assert r.status_code == 422, payload
    assert await Task.find_all().count() == 0


async def test_field_validation(client, team):
    assert (await create(client, team.hana, team.design, team.mia, title="  ")).status_code == 422
    assert (await create(client, team.hana, team.design, team.mia, due_date="31/12/2026")).status_code == 422
    assert (await create(client, team.hana, team.design, team.mia, priority="whenever")).status_code == 422
    assert (await create(client, team.hana, team.design, team.cleo)).status_code == 403  # clients can't be assigned (not a member)
    assert (await create(client, team.admin, team.design, team.cleo)).status_code == 422  # admin may assign anyone, but staff only
    assert (await create(client, team.admin, team.design, team.mia, asset_ids=["x"])).status_code == 422


async def test_create_returns_everything_the_ui_needs(client, team):
    t = await make_task(client, team, due_date=day(5), priority="high")
    assert t["title"] == "Write homepage copy" and t["priority"] == "high" and t["due_date"] == day(5)
    assert t["status"] == "todo" and t["progress"] == 0 and t["total_seconds"] == 0 and t["timer_running"] is False
    assert t["project_name"] == "Acme" and t["subfolder_name"] == "Design"
    assert t["assignee"]["id"] == team.mia.id and t["created_by"]["id"] == team.hana.id
    assert t["can_edit"] is True and t["can_work"] is False  # the head edits; only the assignee works


# --- Creating: who may assign whom (Roles table) ----------------------------------------------------------
async def test_admin_assigns_anyone(client, team):
    assert (await create(client, team.admin, team.design, team.ollie)).status_code == 201  # not in the subfolder
    assert (await create(client, team.admin, team.video, team.mia)).status_code == 201


async def test_head_assigns_members_and_other_heads_of_their_subfolder(client, team):
    assert (await create(client, team.hana, team.design, team.mia)).status_code == 201
    assert (await create(client, team.hana, team.design, team.hana)).status_code == 201  # themselves
    await Subfolder.find_all().update({"$addToSet": {"head_ids": team.max.user.id}})  # Max becomes a second head
    assert (await create(client, team.hana, team.design, team.max)).status_code == 201

    assert (await create(client, team.hana, team.design, team.ollie)).status_code == 403  # not on the subfolder
    assert (await create(client, team.hana, team.design, team.vic)).status_code == 403  # head of a sibling
    assert (await create(client, team.hana, team.video, team.vic)).status_code == 403  # not hana's subfolder


async def test_employee_assigns_only_themselves(client, team):
    assert (await create(client, team.mia, team.design, team.mia)).status_code == 201
    assert (await create(client, team.mia, team.design, team.max)).status_code == 403
    assert (await create(client, team.mia, team.design, team.hana)).status_code == 403
    assert (await create(client, team.mia, team.video, team.mia)).status_code == 403  # not in that subfolder
    assert (await create(client, team.ollie, team.design, team.ollie)).status_code == 403


async def test_clients_cannot_use_tasks(client, team):
    assert (await create(client, team.cleo, team.design, team.cleo)).status_code == 403
    assert (await client.get("/tasks", headers=team.cleo.headers)).status_code == 403


# --- Notifications on assign ------------------------------------------------------------------------------------
async def test_assignee_is_notified_with_a_link_but_not_when_self_assigned(client, team):
    t = await make_task(client, team, assignee=team.mia, due_date=day(3))
    notes = await Notification.find(Notification.type == "task_assigned").to_list()
    assert [n.user_id for n in notes] == [team.mia.user.id]
    assert notes[0].link == f"/app/tasks/{t['id']}" and notes[0].actor_id == team.hana.user.id
    assert "due" in notes[0].body

    await Notification.find_all().delete()
    await create(client, team.mia, team.design, team.mia)
    assert await Notification.find_all().count() == 0

    await create(client, team.hana, team.design, team.hana)
    assert await Notification.find_all().count() == 0

    await create(client, team.admin, team.design, team.admin)  # admins link to the admin area
    await create(client, team.hana, team.design, team.max)
    link = (await Notification.find_one(Notification.user_id == team.max.user.id)).link
    assert link.startswith("/app/tasks/")
    await create(client, team.admin, team.design, team.hana)
    assert (await Notification.find_one(Notification.user_id == team.hana.user.id)).link.startswith("/app/tasks/")


# --- Assets ----------------------------------------------------------------------------------------------------------------
async def upload(client, who, name="brief.txt", content=b"hello"):
    r = await client.post("/files", files=[("files", (name, content, "text/plain"))], headers=who.headers)
    assert r.status_code == 201, r.text
    return r.json()[0]


async def test_files_and_links_attach_and_show_on_the_task(client, team):
    f = await upload(client, team.hana)
    link = (await client.post("/files/link", json={"title": "Brand guide", "url": "https://example.com/brand"}, headers=team.hana.headers)).json()
    t = await make_task(client, team, asset_ids=[f["id"], link["id"]])
    assert [(a["name"], a["kind"]) for a in t["assets"]] == [("brief.txt", "upload"), ("Brand guide", "link")]
    got = (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()
    assert len(got["assets"]) == 2
    # the assignee can download the attachment
    assert (await client.get(got["assets"][0]["url"].replace("/api/v1", ""), headers=team.mia.headers)).content == b"hello"


async def test_cannot_attach_someone_elses_or_missing_files(client, team):
    theirs = await upload(client, team.mia)
    r = await create(client, team.hana, team.design, team.mia, asset_ids=[theirs["id"]])
    assert r.status_code == 422
    assert (await create(client, team.hana, team.design, team.mia, asset_ids=[str(team.design.id)])).status_code == 422
    assert (await create(client, team.admin, team.design, team.mia, asset_ids=[theirs["id"]])).status_code == 201  # admins may


# --- Reading ----------------------------------------------------------------------------------------------------------------------
async def test_list_visibility_and_filters(client, team):
    a = await make_task(client, team, assignee=team.mia, title="A")
    await make_task(client, team, assignee=team.max, title="B")
    vid = (await create(client, team.vic, team.video, team.vic, title="V")).json()
    await Task.find(Task.id == __import__("beanie").PydanticObjectId(a["id"])).update({"$set": {"status": "in_progress"}})

    names = lambda r: sorted(t["title"] for t in r.json())  # noqa: E731
    assert names(await client.get("/tasks", headers=team.admin.headers)) == ["A", "B", "V"]
    assert names(await client.get("/tasks", headers=team.mia.headers)) == ["A", "B", "V"]  # project member sees the whole project
    assert names(await client.get("/tasks?mine=true", headers=team.mia.headers)) == ["A"]
    assert names(await client.get(f"/tasks?subfolder_id={team.video.id}", headers=team.mia.headers)) == ["V"]
    assert names(await client.get("/tasks?status=in_progress", headers=team.mia.headers)) == ["A"]
    assert names(await client.get(f"/tasks?assignee_id={team.max.id}", headers=team.admin.headers)) == ["B"]
    assert await client.get("/tasks", headers=team.ollie.headers) is not None
    assert names(await client.get("/tasks", headers=team.ollie.headers)) == []  # other project, nothing assigned
    assert vid["id"]


async def test_outsider_cannot_open_a_task_unless_assigned_to_it(client, team):
    t = await make_task(client, team)
    assert (await client.get(f"/tasks/{t['id']}", headers=team.ollie.headers)).status_code == 403
    assert (await client.get(f"/tasks/{t['id']}/time-logs", headers=team.ollie.headers)).status_code == 403

    outsider_task = (await create(client, team.admin, team.design, team.ollie)).json()  # admin assigns the outsider
    assert (await client.get(f"/tasks/{outsider_task['id']}", headers=team.ollie.headers)).status_code == 200
    assert (await client.get(f"/tasks/{outsider_task['id']}", headers=team.mia.headers)).status_code == 200
    assert (await client.get(f"/tasks/{team.design.id}", headers=team.mia.headers)).status_code == 404


# --- Editing and deleting --------------------------------------------------------------------------------------------------
async def test_head_edits_and_assignee_is_told(client, team):
    t = await make_task(client, team, due_date=day(5))
    await Notification.find_all().delete()
    r = await client.patch(
        f"/tasks/{t['id']}", json={"title": "New title", "priority": "urgent", "due_date": day(9)}, headers=team.hana.headers
    )
    assert r.status_code == 200 and r.json()["title"] == "New title" and r.json()["due_date"] == day(9)
    note = await Notification.find_one(Notification.type == "task_updated")
    assert note.user_id == team.mia.user.id and "title" in note.body and "due date" in note.body

    cleared = await client.patch(f"/tasks/{t['id']}", json={"due_date": ""}, headers=team.hana.headers)
    assert cleared.json()["due_date"] is None
    assert (await client.patch(f"/tasks/{t['id']}", json={"description": ""}, headers=team.hana.headers)).status_code == 422


async def test_only_admin_head_or_creator_may_edit(client, team):
    t = await make_task(client, team, assignee=team.mia)  # created by the head
    for who in (team.mia, team.max, team.vic, team.ollie):  # assignee, other member, sibling head, outsider
        r = await client.patch(f"/tasks/{t['id']}", json={"title": "Nope"}, headers=who.headers)
        assert r.status_code == 403, who.user.name
    assert (await client.patch(f"/tasks/{t['id']}", json={"title": "Yes"}, headers=team.admin.headers)).status_code == 200

    own = (await create(client, team.mia, team.design, team.mia)).json()  # an employee edits a task they created
    assert (await client.patch(f"/tasks/{own['id']}", json={"title": "Mine"}, headers=team.mia.headers)).status_code == 200


async def test_reassigning_follows_the_assign_rules_and_notifies_both(client, team):
    t = await make_task(client, team, assignee=team.mia)
    assert (await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.vic.id}, headers=team.hana.headers)).status_code == 403
    await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)
    await Notification.find_all().delete()

    r = await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.max.id}, headers=team.hana.headers)
    assert r.status_code == 200 and r.json()["assignee"]["id"] == team.max.id and r.json()["timer_running"] is False
    types = {n.type: n.user_id for n in await Notification.find_all().to_list()}
    assert types == {"task_assigned": team.max.user.id, "task_unassigned": team.mia.user.id}


async def test_approved_task_is_locked(client, team):
    t = await make_task(client, team)
    await Task.find_all().update({"$set": {"status": "approved", "progress": 100}})
    assert (await client.patch(f"/tasks/{t['id']}", json={"title": "x"}, headers=team.hana.headers)).status_code == 409
    got = (await client.get(f"/tasks/{t['id']}", headers=team.hana.headers)).json()
    assert got["can_edit"] is False and got["can_work"] is False


async def test_delete_removes_task_logs_and_attachments(client, team):
    f = await upload(client, team.hana)
    t = await make_task(client, team, asset_ids=[f["id"]])
    await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)
    await Notification.find_all().delete()

    assert (await client.delete(f"/tasks/{t['id']}", headers=team.mia.headers)).status_code == 403  # assignee only
    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 204
    assert await Task.find_all().count() == 0 and await TimeLog.find_all().count() == 0 and await File.find_all().count() == 0
    assert (await Notification.find_one(Notification.type == "task_deleted")).user_id == team.mia.user.id
    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 404


async def test_deleting_a_project_deletes_its_tasks(client, team):
    await make_task(client, team)
    assert (await client.delete(f"/projects/{team.project.id}", headers=team.admin.headers)).status_code == 204
    assert await Task.find_all().count() == 0


# --- Progress ----------------------------------------------------------------------------------------------------------------------------
async def test_assignee_sets_progress_up_to_99(client, team):
    t = await make_task(client, team)
    url = f"/tasks/{t['id']}/progress"
    r = await client.patch(url, json={"progress": 40}, headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["progress"] == 40 and r.json()["status"] == "in_progress"
    assert (await client.patch(url, json={"progress": 99}, headers=team.mia.headers)).status_code == 200
    assert (await client.patch(url, json={"progress": 100}, headers=team.mia.headers)).status_code == 422  # approval sets 100
    assert (await client.patch(url, json={"progress": -1}, headers=team.mia.headers)).status_code == 422
    back = await client.patch(url, json={"progress": 0}, headers=team.mia.headers)
    assert back.json()["progress"] == 0


async def test_only_the_assignee_sets_progress_or_runs_the_timer(client, team):
    t = await make_task(client, team)
    for who in (team.hana, team.admin, team.max, team.ollie):  # not even the head or an admin
        assert (await client.patch(f"/tasks/{t['id']}/progress", json={"progress": 10}, headers=who.headers)).status_code == 403
        assert (await client.post(f"/tasks/{t['id']}/timer/start", headers=who.headers)).status_code == 403


async def test_no_progress_or_timer_once_submitted(client, team):
    t = await make_task(client, team)
    await Task.find_all().update({"$set": {"status": "submitted"}})
    assert (await client.patch(f"/tasks/{t['id']}/progress", json={"progress": 10}, headers=team.mia.headers)).status_code == 409
    assert (await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)).status_code == 409


# --- Timer ---------------------------------------------------------------------------------------------------------------------------------
async def backdate_running(seconds: int):
    """Pretend the running session started `seconds` ago, instead of sleeping."""
    await TimeLog.find(TimeLog.running == True).update(  # noqa: E712
        {"$set": {"started_at": now_utc() - timedelta(seconds=seconds)}}
    )


async def test_timer_start_stop_accumulates_total_time(client, team):
    t = await make_task(client, team)
    start = await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)
    assert start.status_code == 200 and start.json()["stopped_task_id"] is None
    task = start.json()["task"]
    assert task["timer_running"] is True and task["status"] == "in_progress" and task["timer_started_at"]

    await backdate_running(90)
    live = (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()
    assert live["timer_running"] is True and 88 <= live["total_seconds"] <= 95  # a running session counts

    stopped = (await client.post(f"/tasks/{t['id']}/timer/stop", headers=team.mia.headers)).json()
    assert stopped["timer_running"] is False and 88 <= stopped["total_seconds"] <= 95

    await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)  # second session adds up
    await backdate_running(60)
    total = (await client.post(f"/tasks/{t['id']}/timer/stop", headers=team.mia.headers)).json()["total_seconds"]
    assert 148 <= total <= 160

    logs = (await client.get(f"/tasks/{t['id']}/time-logs", headers=team.hana.headers)).json()
    assert len(logs) == 2 and all(not log["running"] for log in logs)
    assert sum(log["seconds"] for log in logs) == total


async def test_starting_a_second_timer_stops_the_first(client, team):
    a = await make_task(client, team, title="A")
    b = await make_task(client, team, title="B")
    await client.post(f"/tasks/{a['id']}/timer/start", headers=team.mia.headers)
    await backdate_running(120)

    r = await client.post(f"/tasks/{b['id']}/timer/start", headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["stopped_task_id"] == a["id"]
    first = (await client.get(f"/tasks/{a['id']}", headers=team.mia.headers)).json()
    assert first["timer_running"] is False and 118 <= first["total_seconds"] <= 125
    assert await TimeLog.find(TimeLog.running == True).count() == 1  # noqa: E712


async def test_timer_edge_cases(client, team):
    t = await make_task(client, team)
    url = f"/tasks/{t['id']}/timer"
    assert (await client.post(f"{url}/stop", headers=team.mia.headers)).status_code == 409  # not running
    assert (await client.post(f"{url}/start", headers=team.mia.headers)).status_code == 200
    assert (await client.post(f"{url}/start", headers=team.mia.headers)).status_code == 409  # already running
    assert (await client.post(f"{url}/stop", headers=team.hana.headers)).status_code == 403
    assert (await client.post(f"/tasks/{team.design.id}/timer/start", headers=team.mia.headers)).status_code == 404


async def test_a_person_can_have_only_one_running_timer(team):
    now = now_utc()
    await TimeLog(task_id=team.design.id, user_id=team.mia.user.id, started_at=now).insert()
    try:
        await TimeLog(task_id=team.video.id, user_id=team.mia.user.id, started_at=now).insert()
        raised = False
    except Exception:
        raised = True
    assert raised  # the database itself refuses a second running session


# --- Due-date reminders -----------------------------------------------------------------------------------------------------------------------
async def reminders_for(task_ids):
    return [n for n in await Notification.find(Notification.type == "task_reminder").to_list()]


async def test_reminders_start_two_days_before_due_and_continue_until_submitted(client, team):
    due = await make_task(client, team, due_date=day(2))
    await make_task(client, team, title="Later", due_date=day(3))
    await make_task(client, team, title="No date")
    await Notification.find_all().delete()

    assert await run_reminders(today_local()) == 1  # only the one due in 2 days
    note = (await reminders_for([due["id"]]))[0]
    assert note.user_id == team.mia.user.id and "due in 2 days" in note.body and note.link == f"/app/tasks/{due['id']}"

    assert await run_reminders(today_local()) == 0  # once per day, however often the job runs

    await Notification.find_all().delete()
    assert await run_reminders(today_local() + timedelta(days=1)) == 2  # tomorrow: the 2-day task and the 3-day one
    bodies = sorted(n.body for n in await reminders_for([]))
    assert any("due tomorrow" in b for b in bodies) and any("due in 2 days" in b for b in bodies)

    await Notification.find_all().delete()
    assert await run_reminders(today_local() + timedelta(days=2)) == 2
    assert any("due today" in n.body for n in await reminders_for([]))

    await Notification.find_all().delete()
    await run_reminders(today_local() + timedelta(days=4))
    assert any("overdue by 2 days" in n.body for n in await reminders_for([]))  # keeps going past the due date


async def test_reminders_stop_once_submitted_or_approved_and_skip_inactive_people(client, team):
    a = await make_task(client, team, title="A", due_date=day(1))
    b = await make_task(client, team, title="B", due_date=day(1), assignee=team.max)
    c = await make_task(client, team, title="C", due_date=day(1), assignee=team.hana)
    d = await make_task(client, team, title="D", due_date=day(1))
    await Notification.find_all().delete()

    from beanie import PydanticObjectId as Oid

    await Task.find(Task.id == Oid(a["id"])).update({"$set": {"status": "submitted"}})
    await Task.find(Task.id == Oid(b["id"])).update({"$set": {"status": "approved"}})
    team.hana.user.is_active = False
    await team.hana.user.save()
    await Task.find(Task.id == Oid(d["id"])).update({"$set": {"status": "changes_requested"}})  # not submitted yet

    assert await run_reminders(today_local()) == 1
    assert (await reminders_for([]))[0].user_id == team.mia.user.id and c["id"]


async def test_changing_the_due_date_allows_a_fresh_reminder(client, team):
    t = await make_task(client, team, due_date=day(1))
    assert await run_reminders(today_local()) == 1
    await client.patch(f"/tasks/{t['id']}", json={"due_date": day(0)}, headers=team.hana.headers)
    assert await run_reminders(today_local()) == 1


async def test_dev_endpoint_runs_the_job_for_admins_only(client, team):
    await make_task(client, team, due_date=day(1))
    assert (await client.post("/tasks/reminders/run", headers=team.mia.headers)).status_code == 403
    assert (await client.post("/tasks/reminders/run")).status_code == 401

    r = await client.post("/tasks/reminders/run", headers=team.admin.headers)
    assert r.status_code == 200 and r.json() == {"day": day(0), "sent": 1}
    assert (await client.post("/tasks/reminders/run", headers=team.admin.headers)).json()["sent"] == 0

    future = await client.post(f"/tasks/reminders/run?today={day(1)}", headers=team.admin.headers)
    assert future.json() == {"day": day(1), "sent": 1}
    assert (await client.post("/tasks/reminders/run?today=nope", headers=team.admin.headers)).status_code == 422


# --- "New for me" badge: tasks handed over by someone else, until the assignee opens them -----------------
async def unseen(client, who):
    r = await client.get("/tasks/unseen-count", headers=who.headers)
    assert r.status_code == 200
    return r.json()["count"]


async def test_unseen_counts_tasks_assigned_by_others_and_clears_per_task(client, team):
    first = await make_task(client, team)
    second = await make_task(client, team)
    assert await unseen(client, team.mia) == 2
    assert await unseen(client, team.hana) == 0  # the assigner has nothing new

    r = await client.post(f"/tasks/{first['id']}/seen", headers=team.mia.headers)
    assert r.status_code == 204
    assert await unseen(client, team.mia) == 1
    await client.post(f"/tasks/{first['id']}/seen", headers=team.mia.headers)  # idempotent
    assert await unseen(client, team.mia) == 1
    await client.post(f"/tasks/{second['id']}/seen", headers=team.hana.headers)  # not the assignee: no-op
    assert await unseen(client, team.mia) == 1


async def test_self_assigned_tasks_are_not_unseen(client, team):
    assert (await create(client, team.mia, team.design, team.mia)).status_code == 201
    assert await unseen(client, team.mia) == 0


async def test_reassigning_marks_it_unseen_for_the_new_assignee(client, team):
    t = await make_task(client, team)
    await client.post(f"/tasks/{t['id']}/seen", headers=team.mia.headers)
    r = await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.max.id}, headers=team.hana.headers)
    assert r.status_code == 200, r.text
    assert await unseen(client, team.max) == 1 and await unseen(client, team.mia) == 0
