from datetime import datetime, time, timedelta, timezone

from app.core.config import settings
from app.core.timeutil import today_local, tz
from app.models import ClientApproval, DailyStatus, Project
from app.models.chat import ChatGroup
from tests.test_checklist_deliverables import MONTH, dl, set_counts
from tests.test_tasks import team  # noqa: F401  (team is a fixture)


async def join_project(team, who=None, project=None):
    who = who or team.cleo
    await Project.find({"_id": (project or team.project).id}).update({"$addToSet": {"client_ids": who.user.id}})


def local(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute), tzinfo=tz())


def tomorrow():
    return today_local() + timedelta(days=1)


# --- Who can use it ---------------------------------------------------------------------------------------------------
async def test_the_portal_endpoints_are_for_clients_only(client, team):
    for path in ("/portal/projects", "/portal/summary", "/portal/deliverables"):
        assert (await client.get(path)).status_code == 401, path
        for who in (team.admin, team.hana, team.mia):
            assert (await client.get(path, headers=who.headers)).status_code == 403, (path, who)
        assert (await client.get(path, headers=team.cleo.headers)).status_code == 200, path


# --- Projects ---------------------------------------------------------------------------------------------------------
async def test_projects_lists_only_my_projects_with_the_team_i_can_meet(client, team, make_user):
    assert (await client.get("/portal/projects", headers=team.cleo.headers)).json() == []  # not on any project yet
    await join_project(team)
    other = await make_user("client", "Other Client")
    await join_project(team, other, team.project)

    r = (await client.get("/portal/projects", headers=team.cleo.headers)).json()
    assert len(r) == 1
    p = r[0]
    assert p["id"] == str(team.project.id) and p["name"] == "Acme"
    assert [s["name"] for s in p["subfolders"]] == ["Design", "Video"]  # the other project's "Elsewhere" is not here
    team_by_id = {t["user"]["id"]: t for t in p["team"]}
    assert set(team_by_id) == {team.hana.id, team.mia.id, team.max.id, team.vic.id}  # no clients, no one from other projects
    assert team_by_id[team.hana.id]["is_head"] is True and team_by_id[team.vic.id]["is_head"] is True and team_by_id[team.mia.id]["is_head"] is False
    assert "password_hash" not in str(r) and "email" not in team_by_id[team.hana.id]["user"]


async def test_inactive_team_members_are_not_offered(client, team):
    await join_project(team)
    team.max.user.is_active = False
    await team.max.user.save()
    ids = {t["user"]["id"] for t in (await client.get("/portal/projects", headers=team.cleo.headers)).json()[0]["team"]}
    assert team.max.id not in ids


# --- Deliverables -----------------------------------------------------------------------------------------------------
async def test_deliverables_are_read_only_and_only_for_my_projects(client, team):
    await join_project(team)
    await set_counts(client, team.hana, team.design, {"Reels": 3, "Creatives": 1})
    await set_counts(client, team.admin, team.elsewhere, {"Reels": 9})  # a different project: invisible to Cleo
    await set_counts(client, team.admin, team.video, {"Reels": 2}, month="2026-12")  # a different month

    r = await client.get("/portal/deliverables", params={"month": MONTH}, headers=team.cleo.headers)
    assert r.status_code == 200
    groups = r.json()
    assert [(g["project"]["name"], g["subfolder"]["name"]) for g in groups] == [("Acme", "Design")]  # empty subfolders are left out
    d = groups[0]["deliverables"]
    assert d["total"] == 4 and d["can_set_counts"] is False and d["can_set_stage"] is False
    assert {t["type"]: (t["done"], t["remaining"]) for t in d["types"]} == {"Reels": (0, 3), "Creatives": (0, 1)}

    assert [g["subfolder"]["name"] for g in (await client.get("/portal/deliverables", params={"month": "2026-12"}, headers=team.cleo.headers)).json()] == ["Video"]
    assert (await client.get("/portal/deliverables", params={"month": "2030-01"}, headers=team.cleo.headers)).json() == []
    for bad in ("bad", "2026-13", "26-11"):
        assert (await client.get("/portal/deliverables", params={"month": bad}, headers=team.cleo.headers)).status_code == 422, bad
    default = await client.get("/portal/deliverables", headers=team.cleo.headers)  # this month
    assert default.status_code == 200


# --- Summary --------------------------------------------------------------------------------------------------------------
async def test_the_home_summary_pulls_it_together(client, team):
    await join_project(team)
    this_month = today_local().strftime("%Y-%m")

    d = (await set_counts(client, team.hana, team.design, {"Reels": 4}, month=this_month)).json()
    for item in d["items"][:2]:
        await client.patch(f"{dl(team.design, this_month)}/items/{item['id']}", json={"stage": "posted"}, headers=team.mia.headers)
    await client.patch(f"{dl(team.design, this_month)}/items/{d['items'][2]['id']}", json={"stage": "editing"}, headers=team.mia.headers)
    await set_counts(client, team.admin, team.video, {"Creatives": 2}, month=this_month)

    group = await ChatGroup(name="Acme chat", member_ids=[team.hana.user.id], client_ids=[team.cleo.user.id], created_by=team.hana.user.id).insert()
    for q in ("Logo OK?", "Colours OK?", "Copy OK?", "Dates OK?"):
        await ClientApproval(group_id=group.id, question=q, created_by=team.hana.user.id).insert()
    await ClientApproval(group_id=group.id, question="Old one", status="approved", created_by=team.hana.user.id).insert()

    for i in range(4):
        await client.post(f"/projects/{team.project.id}/requirements", json={"title": f"Req {i}", "details": "x"}, headers=team.cleo.headers)

    r = await client.get("/portal/summary", headers=team.cleo.headers)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["month"] == this_month
    assert s["pending_approvals"] == 4 and len(s["approvals"]) == 3 and all(a["approval"]["status"] == "pending" for a in s["approvals"])  # a few shown, all counted
    assert s["approvals"][0]["group_name"] == "Acme chat"
    dv = s["deliverables"]
    assert (dv["total"], dv["done"], dv["remaining"]) == (6, 2, 4)
    assert dv["progress"] == round(100 * (6 + 6 + 3) / (6 * 6))  # two posted, one editing, three still writing
    assert [r["title"] for r in s["latest_requirements"]] == ["Req 3", "Req 2", "Req 1"]  # newest three

    other = (await client.get("/portal/summary", params={"month": "2030-01"}, headers=team.cleo.headers)).json()
    assert other["deliverables"] == {"total": 0, "done": 0, "remaining": 0, "progress": 0}
    assert (await client.get("/portal/summary", params={"month": "nope"}, headers=team.cleo.headers)).status_code == 422


async def test_an_empty_summary(client, team):
    s = (await client.get("/portal/summary", headers=team.cleo.headers)).json()
    assert s["pending_approvals"] == 0 and s["approvals"] == [] and s["latest_requirements"] == []
    assert s["deliverables"]["total"] == 0


# --- Free slots -------------------------------------------------------------------------------------------------------------
async def slots(client, who, host, day, minutes=30):
    r = await client.get("/bookings/availability", params={"host_user_id": host.id, "date": day.isoformat(), "minutes": minutes}, headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


def starts(data):
    return [datetime.fromisoformat(s["start"]).astimezone(tz()).strftime("%H:%M") for s in data["slots"]]


async def test_free_slots_cover_working_hours_in_half_hour_steps(client, team):
    await join_project(team)
    data = await slots(client, team.cleo, team.hana, tomorrow())
    got = starts(data)
    assert got[0] == f"{settings.WORK_START_HOUR:02d}:00" and got[-1] == f"{settings.WORK_END_HOUR - 1:02d}:30"
    assert len(got) == (settings.WORK_END_HOUR - settings.WORK_START_HOUR) * 2 and data["note"] is None and data["minutes"] == 30
    first = data["slots"][0]
    assert datetime.fromisoformat(first["end"]) - datetime.fromisoformat(first["start"]) == timedelta(minutes=30)

    hour = await slots(client, team.cleo, team.hana, tomorrow(), minutes=60)
    assert starts(hour)[-1] == f"{settings.WORK_END_HOUR - 1:02d}:00"  # a one-hour meeting must finish by closing time
    assert len(hour["slots"]) == (settings.WORK_END_HOUR - settings.WORK_START_HOUR) * 2 - 1


async def test_booked_time_is_not_offered_and_a_booking_made_from_a_slot_works(client, team):
    await join_project(team)
    day = tomorrow()
    r = await client.post("/bookings", json={
        "host_user_id": team.hana.id, "start": local(day, 9, 30).isoformat(), "end": local(day, 10, 30).isoformat(), "title": "Kickoff", "note": "",
    }, headers=team.cleo.headers)
    assert r.status_code == 201, r.text

    half = starts(await slots(client, team.cleo, team.hana, day))
    assert "09:00" in half and "09:30" not in half and "10:00" not in half and "10:30" in half  # 09:00-09:30 just touches the booking
    hour = starts(await slots(client, team.cleo, team.hana, day, minutes=60))
    assert "09:00" not in hour and "10:00" not in hour and "10:30" in hour and "08:30" not in hour
    # anyone allowed to see the calendar sees the same free time
    assert starts(await slots(client, team.mia, team.hana, day)) == half

    again = await client.post("/bookings", json={
        "host_user_id": team.hana.id, "start": local(day, 10, 0).isoformat(), "end": local(day, 10, 30).isoformat(), "title": "Clash", "note": "",
    }, headers=team.cleo.headers)
    assert again.status_code == 409


async def test_no_slots_on_leave_in_the_past_or_when_fully_booked(client, team):
    await join_project(team)
    day = tomorrow()
    await DailyStatus(user_id=team.hana.user.id, date=day.isoformat(), status="leave", set_at=datetime.now(timezone.utc)).insert()
    data = await slots(client, team.cleo, team.hana, day)
    assert data["slots"] == [] and "on leave" in data["note"]

    past = await slots(client, team.cleo, team.mia, today_local() - timedelta(days=1))
    assert past["slots"] == [] and "past" in past["note"]

    later = day + timedelta(days=1)
    await client.post("/bookings", json={
        "host_user_id": team.mia.id, "start": local(later, settings.WORK_START_HOUR).isoformat(),
        "end": local(later, settings.WORK_START_HOUR + 8).isoformat(), "title": "All day", "note": "",
    }, headers=team.cleo.headers)
    await client.post("/bookings", json={
        "host_user_id": team.mia.id, "start": local(later, settings.WORK_START_HOUR + 8).isoformat(),
        "end": local(later, settings.WORK_END_HOUR).isoformat(), "title": "Rest", "note": "",
    }, headers=team.cleo.headers)
    full = await slots(client, team.cleo, team.mia, later)
    assert full["slots"] == [] and full["note"]


async def test_today_only_offers_times_that_have_not_started(client, team):
    await join_project(team)
    data = await slots(client, team.cleo, team.hana, today_local())
    now = datetime.now(timezone.utc)
    assert all(datetime.fromisoformat(s["start"]) >= now for s in data["slots"])


async def test_availability_follows_the_calendar_rules(client, team, make_user):
    day = tomorrow()
    params = {"host_user_id": team.hana.id, "date": day.isoformat()}
    assert (await client.get("/bookings/availability", params=params)).status_code == 401
    assert (await client.get("/bookings/availability", params=params, headers=team.cleo.headers)).status_code == 403  # not on Hana's project yet
    await join_project(team)
    assert (await client.get("/bookings/availability", params=params, headers=team.cleo.headers)).status_code == 200
    assert (await client.get("/bookings/availability", params={**params, "host_user_id": team.ollie.id}, headers=team.cleo.headers)).status_code == 403  # not on her team
    assert (await client.get("/bookings/availability", params={**params, "host_user_id": team.cleo.id}, headers=team.hana.headers)).status_code == 404  # clients can't be hosts
    for bad in ({"minutes": 10}, {"minutes": 20}, {"minutes": 300}, {"date": "tomorrow"}):
        assert (await client.get("/bookings/availability", params={**params, **bad}, headers=team.cleo.headers)).status_code == 422, bad
    assert (await client.get("/bookings/availability", params={"date": day.isoformat()}, headers=team.cleo.headers)).status_code == 422
