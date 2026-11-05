import asyncio

from app.models import Task, TimeLog
from tests.test_tasks import backdate_running, make_task, team  # noqa: F401  (team is a fixture)


async def start(client, who, task):
    return await client.post("/timer/start", json={"task_id": task["id"]}, headers=who.headers)


async def current(client, who):
    r = await client.get("/timer/current", headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


async def test_requires_login(client):
    assert (await client.get("/timer/current")).status_code == 401
    assert (await client.post("/timer/pause")).status_code == 401


async def test_idle_then_running_then_paused_then_resumed(client, team):
    t = await make_task(client, team)
    assert (await current(client, team.mia))["state"] == "idle"

    r = await start(client, team.mia, t)
    body = r.json()
    assert r.status_code == 200 and body["state"] == "running" and body["task"]["id"] == t["id"]
    assert body["started_at"] and body["server_now"] and body["stopped_task"] is None
    assert body["task"]["subfolder_id"] == str(team.design.id)

    await backdate_running(75)
    live = await current(client, team.mia)
    assert 73 <= live["task"]["total_seconds"] <= 80  # counted from the saved start time

    paused = (await client.post("/timer/pause", headers=team.mia.headers)).json()
    assert paused["state"] == "paused" and paused["task"]["id"] == t["id"] and 73 <= paused["task"]["total_seconds"] <= 80
    assert await TimeLog.find(TimeLog.running == True).count() == 0  # noqa: E712

    resumed = (await client.post("/timer/resume", headers=team.mia.headers)).json()
    assert resumed["state"] == "running" and resumed["task"]["id"] == t["id"]
    logs = await TimeLog.find_all().to_list()
    assert len(logs) == 2 and sum(1 for log in logs if log.running) == 1  # a new session, the old one stays closed
    assert all(log.subfolder_id == team.design.id for log in logs)


async def test_play_on_another_task_closes_the_first_and_names_it(client, team):
    a = await make_task(client, team, title="A")
    b = await make_task(client, team, title="B")
    await start(client, team.mia, a)
    await backdate_running(120)

    r = (await start(client, team.mia, b)).json()
    assert r["state"] == "running" and r["task"]["id"] == b["id"]
    assert r["stopped_task"]["id"] == a["id"] and r["stopped_task"]["title"] == "A"
    assert 118 <= r["stopped_task"]["total_seconds"] <= 125
    assert await TimeLog.find(TimeLog.running == True).count() == 1  # noqa: E712


async def test_playing_the_running_task_again_changes_nothing(client, team):
    t = await make_task(client, team)
    await start(client, team.mia, t)
    again = await start(client, team.mia, t)
    assert again.status_code == 200 and again.json()["stopped_task"] is None
    assert await TimeLog.find_all().count() == 1


async def test_two_starts_at_the_same_moment_leave_one_running(client, team):
    a = await make_task(client, team, title="A")
    b = await make_task(client, team, title="B")
    results = await asyncio.gather(start(client, team.mia, a), start(client, team.mia, b))
    assert all(r.status_code == 200 for r in results)
    assert await TimeLog.find(TimeLog.running == True).count() == 1  # noqa: E712


async def test_timers_are_per_person(client, team):
    t1 = await make_task(client, team, title="Mia's")
    t2 = await make_task(client, team, assignee=team.max, title="Max's")
    await start(client, team.mia, t1)
    await start(client, team.max, t2)
    assert (await current(client, team.mia))["task"]["id"] == t1["id"]
    assert (await current(client, team.max))["task"]["id"] == t2["id"]
    assert await TimeLog.find(TimeLog.running == True).count() == 2  # noqa: E712


async def test_only_the_assignee_can_play_and_the_task_must_be_open(client, team):
    t = await make_task(client, team)
    assert (await start(client, team.max, t)).status_code == 403
    assert (await start(client, team.hana, t)).status_code == 403
    assert (await client.post("/timer/start", json={"task_id": str(team.design.id)}, headers=team.mia.headers)).status_code == 404
    await Task.find_all().update({"$set": {"status": "submitted"}})
    assert (await start(client, team.mia, t)).status_code == 409


async def test_pause_and_resume_edge_cases(client, team):
    assert (await client.post("/timer/pause", headers=team.mia.headers)).status_code == 409  # nothing running
    assert (await client.post("/timer/resume", headers=team.mia.headers)).status_code == 409  # nothing paused
    t = await make_task(client, team)
    await start(client, team.mia, t)
    assert (await client.post("/timer/resume", headers=team.mia.headers)).status_code == 409  # already running
    await client.post("/timer/pause", headers=team.mia.headers)
    await Task.find_all().update({"$set": {"status": "submitted"}})
    assert (await current(client, team.mia))["state"] == "idle"  # a submitted task can't be resumed
    assert (await client.post("/timer/resume", headers=team.mia.headers)).status_code == 409


async def test_per_task_endpoints_see_the_same_session(client, team):
    t = await make_task(client, team)
    await start(client, team.mia, t)
    task = (await client.get(f"/tasks/{t['id']}", headers=team.mia.headers)).json()
    assert task["timer_running"] is True
    stopped = (await client.post(f"/tasks/{t['id']}/timer/stop", headers=team.mia.headers)).json()
    assert stopped["timer_running"] is False
    assert (await current(client, team.mia))["state"] == "paused"


# --- Working now + realtime ------------------------------------------------------------------------------------------------------------
async def working(client, who, sub):
    return await client.get(f"/timer/working/{sub.id}", headers=who.headers)


async def test_working_now_lists_who_has_a_running_timer_in_the_subfolder(client, team):
    t = await make_task(client, team)
    assert (await working(client, team.hana, team.design)).json() == []
    await start(client, team.mia, t)

    for viewer in (team.hana, team.max, team.admin, team.mia):  # head, member, admin, the worker
        rows = (await working(client, viewer, team.design)).json()
        assert len(rows) == 1 and rows[0]["task_id"] == t["id"] and rows[0]["user"]["id"] == team.mia.id, viewer
    assert (await working(client, team.hana, team.video)).status_code == 403  # another subfolder: Video is private to its own people

    await client.post("/timer/pause", headers=team.mia.headers)
    assert (await working(client, team.hana, team.design)).json() == []


async def test_working_now_is_only_for_people_who_can_open_the_subfolder(client, team):
    assert (await working(client, team.ollie, team.design)).status_code == 403  # staff of another project
    assert (await working(client, team.cleo, team.design)).status_code == 403  # clients never see it
    assert (await client.get(f"/timer/working/{team.design.id}")).status_code == 401


async def test_timer_changes_are_pushed_live(client, team, monkeypatch):
    sent = []

    async def record(user_ids, event, data):
        sent.append((set(user_ids), event, data))

    monkeypatch.setattr("app.services.timer.manager.send_to_users", record)
    a = await make_task(client, team, title="A")
    b = await make_task(client, team, title="B")

    await start(client, team.mia, a)
    own = [s for s in sent if s[1] == "timer"]
    assert len(own) == 1 and own[0][0] == {team.mia.user.id} and own[0][2]["state"] == "running"
    seen = [s for s in sent if s[1] == "presence"]
    assert len(seen) == 1 and seen[0][2]["running"] is True and seen[0][2]["task_id"] == a["id"]
    audience = seen[0][0]
    assert {team.hana.user.id, team.max.user.id, team.mia.user.id, team.admin.user.id} <= audience
    assert team.vic.user.id not in audience and team.cleo.user.id not in audience and team.ollie.user.id not in audience  # Design is private

    sent.clear()
    await start(client, team.mia, b)  # a switch is one "timer" message and two presence messages
    assert [s[1] for s in sent].count("timer") == 1
    flags = {s[2]["task_id"]: s[2]["running"] for s in sent if s[1] == "presence"}
    assert flags == {a["id"]: False, b["id"]: True}

    sent.clear()
    await client.post("/timer/pause", headers=team.mia.headers)
    assert [s[2]["state"] for s in sent if s[1] == "timer"] == ["paused"]
    assert [s[2]["running"] for s in sent if s[1] == "presence"] == [False]


async def test_timer_log_lists_sessions_newest_first_with_the_running_one_and_a_total(client, team):
    t = await make_task(client, team)
    await start(client, team.mia, t)
    await client.post("/timer/pause", headers=team.mia.headers)
    await start(client, team.mia, t)
    r = await client.get(f"/timer/log/{t['id']}", headers=team.mia.headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["entries"]) == 2
    first, second = body["entries"]  # newest first
    assert first["running"] is True and first["ended_at"] is None and first["user"]["id"] == team.mia.id
    assert second["running"] is False and second["ended_at"] is not None
    assert body["total_seconds"] >= second["seconds"]


async def test_timer_log_is_for_the_assignee_the_head_and_admins_only(client, team):
    t = await make_task(client, team)
    url = f"/timer/log/{t['id']}"
    for who in (team.mia, team.hana, team.admin):
        assert (await client.get(url, headers=who.headers)).status_code == 200, who
    for who in (team.max, team.vic, team.ollie, team.cleo):  # a fellow member, another head, an outsider, a client
        assert (await client.get(url, headers=who.headers)).status_code == 403, who
    assert (await client.get(f"/timer/log/{'a' * 24}", headers=team.admin.headers)).status_code == 404
