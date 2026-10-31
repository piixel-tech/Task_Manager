from datetime import datetime, timedelta, timezone

from app.core.timeutil import today_local
from app.models import ClientApproval
from app.models.booking import Booking
from app.models.chat import ChatGroup
from tests.test_portal import join_project
from tests.test_tasks import make_task, team  # noqa: F401  (team is a fixture)


async def test_admin_dashboard_is_for_admins_only(client, team):
    assert (await client.get("/dashboard/admin")).status_code == 401
    for who in (team.hana, team.cleo):
        assert (await client.get("/dashboard/admin", headers=who.headers)).status_code == 403
    assert (await client.get("/dashboard/admin", headers=team.admin.headers)).status_code == 200


async def test_task_counts_and_project_health(client, team):
    today = today_local()
    await make_task(client, team, due_date=(today - timedelta(days=2)).isoformat())
    await make_task(client, team, due_date=today.isoformat())
    await make_task(client, team)
    r = (await client.get("/dashboard/admin", headers=team.admin.headers)).json()
    assert r["tasks"]["overdue"] == 1 and r["tasks"]["due_today"] == 1 and r["tasks"]["open"] == 3
    acme = next(p for p in r["projects"] if p["name"] == "Acme")
    assert acme["total"] == 3 and acme["overdue"] == 1
    assert "password_hash" not in str(r)


async def test_oldest_approvals_only_come_from_groups_the_admin_is_in(client, team):
    mine = await ChatGroup(name="Mine", member_ids=[team.admin.user.id, team.hana.user.id], client_ids=[team.cleo.user.id], created_by=team.hana.user.id).insert()
    theirs = await ChatGroup(name="Not mine", member_ids=[team.hana.user.id], client_ids=[team.cleo.user.id], created_by=team.hana.user.id).insert()
    now = datetime.now(timezone.utc)
    await ClientApproval(group_id=theirs.id, question="Hidden, oldest of all", created_by=team.hana.user.id, created_at=now - timedelta(days=9)).insert()
    await ClientApproval(group_id=mine.id, question="Second", created_by=team.hana.user.id, created_at=now - timedelta(days=1)).insert()
    await ClientApproval(group_id=mine.id, question="First", created_by=team.hana.user.id, created_at=now - timedelta(days=3)).insert()
    await ClientApproval(group_id=mine.id, question="Answered", status="approved", created_by=team.hana.user.id).insert()

    items = (await client.get("/dashboard/admin", headers=team.admin.headers)).json()["approvals"]
    assert [i["approval"]["question"] for i in items] == ["First", "Second"]  # oldest first, none from a group the admin is not in
    assert {i["group_name"] for i in items} == {"Mine"}

    # An admin who is in no client group sees none at all.
    await ChatGroup.find({"_id": mine.id}).update({"$pull": {"member_ids": team.admin.user.id}})
    assert (await client.get("/dashboard/admin", headers=team.admin.headers)).json()["approvals"] == []


async def test_todays_meetings_and_workload(client, team):
    await make_task(client, team)
    start = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    await Booking(host_user_id=team.hana.user.id, booked_by=team.cleo.user.id, start=start, end=start + timedelta(minutes=30), title="Kickoff").insert()
    r = (await client.get("/dashboard/admin", headers=team.admin.headers)).json()
    assert r["workload"] and r["workload"][0]["open"] >= 1


async def test_my_bookings_only_returns_meetings_i_am_part_of(client, team):
    start = datetime.now(timezone.utc) + timedelta(hours=2)
    end = start + timedelta(minutes=30)
    await Booking(host_user_id=team.hana.user.id, booked_by=team.cleo.user.id, start=start, end=end, title="Kickoff").insert()
    await Booking(host_user_id=team.mia.user.id, booked_by=team.max.user.id, start=start, end=end, title="Private").insert()
    await Booking(host_user_id=team.hana.user.id, booked_by=team.cleo.user.id, start=start - timedelta(days=2), end=end - timedelta(days=2), title="Past").insert()

    assert [b["title"] for b in (await client.get("/bookings/mine", headers=team.cleo.headers)).json()] == ["Kickoff"]
    assert [b["title"] for b in (await client.get("/bookings/mine", headers=team.hana.headers)).json()] == ["Kickoff"]
    assert (await client.get("/bookings/mine", headers=team.ollie.headers)).json() == []
    assert (await client.get("/bookings/mine")).status_code == 401


async def test_portal_summary_has_stage_breakdown_for_my_projects_only(client, team):
    await join_project(team)
    r = (await client.get("/portal/summary", headers=team.cleo.headers)).json()
    assert set(r["stages"]) and sum(r["stages"].values()) == 0 and r["projects"] == []
