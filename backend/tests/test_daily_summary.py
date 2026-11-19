"""The 9:30 morning summary email: who gets one, what is in it, and that it never goes out empty or twice."""
from datetime import datetime, timedelta, timezone

import pytest
from beanie import PydanticObjectId

from app.core.timeutil import today_local, tz
from app.models import Booking, EmailLog, LeaveRequest, Task, User
from app.services import daily_summary as ds
from app.services import email as mail
from tests.test_tasks import day, make_task, team  # noqa: F401  (team is a fixture)
from tests.test_reviews import submit


@pytest.fixture
def mails(monkeypatch):
    """Rendered summaries as (to, subject, html, plain); each also gets an EmailLog row like the real sender makes."""
    box: list[tuple[str, str, str, str]] = []

    async def fake(to, type, subject, html, plain):
        entry = EmailLog(to=to, type=type, subject=subject)
        if type == "daily_summary":  # other emails (e.g. "review needed") are not what is under test
            box.append((to, subject, html, plain))
            await entry.insert()
        return entry

    monkeypatch.setattr(mail, "send_rendered", fake)
    return box


async def set_due(task, when):
    await Task.find({"_id": PydanticObjectId(task["id"])}).update({"$set": {"due_date": when}})


async def meeting(host, booker, hours_from_start=3, title="Sync", attendees=()):
    start = datetime.combine(today_local(), datetime.min.time(), tzinfo=tz()).astimezone(timezone.utc) + timedelta(hours=hours_from_start)
    return await Booking(host_user_id=host.user.id, booked_by=booker.user.id, start=start, end=start + timedelta(minutes=30), title=title, attendees=list(attendees)).insert()


async def test_nothing_to_show_means_no_email(client, team, mails):
    assert await ds.run_daily_summary() == 0
    assert mails == []
    t = await make_task(client, team)
    await set_due(t, day(3))  # due later, not today: still nothing
    assert await ds.run_daily_summary() == 0 and mails == []


async def test_due_and_overdue_tasks_are_listed_with_links_to_each_task(client, team, mails):
    today, late, later = await make_task(client, team, title="Due today"), await make_task(client, team, title="Way late"), await make_task(client, team, title="Next week")
    await set_due(today, day(0))
    await set_due(late, day(-3))
    await set_due(later, day(5))
    assert await ds.run_daily_summary() == 1
    to, subject, html, plain = mails[0]
    assert to == team.mia.user.email and subject == "Your day: 1 due today, 1 overdue"
    assert "Due today" in html and "Way late" in html and "Next week" not in html
    assert f"/app/tasks/{today['id']}" in html and f"/app/tasks/{late['id']}" in html and f"/app/tasks/{late['id']}" in plain
    assert "Good morning, Mia" in html and "/app/dashboard" in html
    assert [m[0] for m in mails] == [team.mia.user.email]  # nobody else had anything


async def test_finished_tasks_do_not_count(client, team, mails):
    t = await make_task(client, team)
    await set_due(t, day(-1))
    await Task.find({"_id": PydanticObjectId(t["id"])}).update({"$set": {"status": "approved"}})
    assert await ds.run_daily_summary() == 0


async def test_reviews_waiting_go_to_the_head_with_a_link_to_the_task(client, team, mails):
    t = await make_task(client, team, title="Homepage copy")
    assert (await submit(client, team.mia, t, team.hana)).status_code == 201
    assert await ds.run_daily_summary() == 1
    to, subject, html, _ = mails[0]
    assert to == team.hana.user.email and subject == "Your day: 1 to review"
    assert "Waiting for your review" in html and "Homepage copy" in html and "From Mia Member" in html and f"/app/tasks/{t['id']}" in html


async def test_meetings_today_go_to_the_host_the_booker_and_invited_teammates(client, team, mails):
    from app.models.booking import Attendee

    await meeting(team.hana, team.mia, title="Design sync", attendees=[Attendee(email=team.max.user.email, name="Max", user_id=team.max.user.id)])
    tomorrow = await meeting(team.hana, team.mia, title="Tomorrow thing")
    await Booking.find({"_id": tomorrow.id}).update({"$set": {"start": tomorrow.start + timedelta(days=1), "end": tomorrow.end + timedelta(days=1)}})
    assert await ds.run_daily_summary() == 3
    assert sorted(m[0] for m in mails) == sorted([team.hana.user.email, team.mia.user.email, team.max.user.email])
    assert all("Design sync" in m[2] and "Tomorrow thing" not in m[2] and "meetings" in m[1] for m in mails)
    mia = next(m for m in mails if m[0] == team.mia.user.email)
    assert f"/app/calendar/{team.hana.user.id}" in mia[2]  # the calendar the meeting is on


async def test_admins_also_see_pending_leave_requests_sent_to_them(client, team, mails):
    await LeaveRequest(user_id=team.mia.user.id, company_id=None, type="leave", start_date=day(3), end_date=day(4), reason="Trip", admin_id=team.admin.user.id).insert()
    done = await LeaveRequest(user_id=team.max.user.id, company_id=None, type="wfh", start_date=day(3), end_date=day(3), reason="x", admin_id=team.admin.user.id, status="approved").insert()
    assert done.status == "approved"
    assert await ds.run_daily_summary() == 1
    to, subject, html, _ = mails[0]
    assert to == team.admin.user.email and subject == "Your day: 1 leave requests"
    assert "Leave requests waiting" in html and "Mia Member" in html and "/admin/leave-requests" in html and "Max Member" not in html


async def test_employees_never_get_the_leave_section(client, team, mails):
    await LeaveRequest(user_id=team.max.user.id, company_id=None, type="leave", start_date=day(3), end_date=day(3), reason="x", admin_id=team.mia.user.id).insert()
    assert await ds.run_daily_summary() == 0  # addressed to a non-admin: not shown to them


async def test_one_email_a_day_per_person_even_if_the_job_runs_again(client, team, mails):
    t = await make_task(client, team)
    await set_due(t, day(0))
    assert await ds.run_daily_summary() == 1
    assert await ds.run_daily_summary() == 0
    assert len(mails) == 1


async def test_people_can_turn_it_off_and_clients_and_inactive_never_get_it(client, team, mails):
    t = await make_task(client, team)
    await set_due(t, day(0))
    mia = await User.get(team.mia.user.id)
    mia.settings = {"notif_prefs": {"daily_email": False}}
    await mia.save()
    assert await ds.run_daily_summary() == 0
    mia.settings = {}
    mia.is_active = False
    await mia.save()
    assert await ds.run_daily_summary() == 0
    assert mails == []


async def test_the_setting_is_on_by_default_and_saved_through_settings(client, team):
    mine = await client.put("/me/settings", json={"notif_prefs": {"daily_email": False}}, headers=team.mia.headers)
    assert mine.status_code == 200 and mine.json()["notif_prefs"]["daily_email"] is False
    fresh = await client.put("/me/settings", json={}, headers=team.max.headers)
    assert fresh.json()["notif_prefs"]["daily_email"] is True


async def test_long_lists_are_cut_with_a_link_to_the_rest(client, team, mails):
    for i in range(ds.SHOWN + 2):
        await set_due(await make_task(client, team, title=f"Item {i:02d}"), day(0))
    await ds.run_daily_summary()
    html = mails[0][2]
    assert "+2 more" in html and html.count("/app/tasks/") >= ds.SHOWN and mails[0][1] == f"Your day: {ds.SHOWN + 2} due today"


def test_it_runs_every_day_at_9_30_india_time_whatever_the_server_zone():
    from app.services.scheduler import DAILY_SUMMARY_TRIGGER as trigger

    fields = {f.name: str(f) for f in trigger.fields}
    assert fields["hour"] == "9" and fields["minute"] == "30" and fields["day_of_week"] == "*"
    assert str(trigger.timezone) == "Asia/Kolkata"
    # 9:30 IST is 04:00 UTC
    nxt = trigger.get_next_fire_time(None, datetime(2026, 11, 19, 0, 0, tzinfo=timezone.utc))
    assert nxt.astimezone(timezone.utc).strftime("%H:%M") == "04:00"
