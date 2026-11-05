import io
import zipfile
from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId

from app.core.timeutil import today_local, tz
from app.models import User, DailyStatus, MonthlyReport, Task, TaskActivity, TaskReview, TimeLog
from app.services.monthly_report import finalize_previous_month, month_of
from tests.test_tasks import make_task, team  # noqa: F401  (team is a fixture)

THIS = month_of(today_local())
LAST = month_of(today_local().replace(day=1) - timedelta(days=1))


def url(person, month=THIS, suffix=""):
    return f"/reports/monthly/{person.id}{suffix}?month={month}"


def at(day: str, hour=9, minute=30) -> datetime:
    y, m, d = map(int, day.split("-"))
    return datetime(y, m, d, hour, minute, tzinfo=tz()).astimezone(timezone.utc)


async def approve(task_id: str, decided_on: str, **extra):
    await Task.find({"_id": PydanticObjectId(task_id)}).update({"$set": {"status": "approved"}})
    t = await Task.get(PydanticObjectId(task_id))
    await TaskReview(task_id=t.id, round=1, submitted_by=t.assignee_id, approver_id=t.created_by, note="done", decision="approved", decided_at=at(decided_on), **extra).insert()


async def test_who_can_read_a_report(client, team):
    assert (await client.get(url(team.mia.user), headers=team.mia.headers)).status_code == 200  # their own
    assert (await client.get(url(team.mia.user), headers=team.admin.headers)).status_code == 200  # admin: anyone's
    assert (await client.get(url(team.mia.user), headers=team.max.headers)).status_code == 403  # a colleague
    assert (await client.get(url(team.mia.user), headers=team.hana.headers)).status_code == 403  # a head
    assert (await client.get(url(team.mia.user), headers=team.cleo.headers)).status_code == 403  # a client
    assert (await client.get(url(team.admin.user), headers=team.admin.headers)).status_code == 404  # reports are for employees
    # the list and the ZIP are the admin's
    assert (await client.get(f"/reports/monthly?month={THIS}", headers=team.admin.headers)).status_code == 200
    for who in (team.mia, team.hana, team.cleo):
        assert (await client.get(f"/reports/monthly?month={THIS}", headers=who.headers)).status_code == 403
        assert (await client.get(f"/reports/monthly/all.zip?month={THIS}", headers=who.headers)).status_code == 403


async def test_reports_are_read_only_and_months_are_checked(client, team):
    assert (await client.put(url(team.mia.user), headers=team.admin.headers, json={})).status_code == 405
    assert (await client.get(url(team.mia.user, "2999-01"), headers=team.mia.headers)).status_code == 422  # the future
    assert (await client.get(url(team.mia.user, "nope"), headers=team.mia.headers)).status_code == 422


async def test_the_report_counts_attendance_tasks_time_and_changes(client, team):
    today = today_local()
    first = today.replace(day=1)
    days = [first.isoformat(), (first + timedelta(days=1)).isoformat(), (first + timedelta(days=2)).isoformat()]
    for day, status, hour in zip(days, ("present", "wfh", "leave"), (9, 10, 11)):
        await DailyStatus(user_id=team.mia.user.id, date=day, status=status, set_at=at(day, 18), first_set_at=at(day, hour)).insert()

    early = await make_task(client, team, assignee=team.mia, title="Early one")
    late = await make_task(client, team, assignee=team.mia, title="Late one")
    open_ = await make_task(client, team, assignee=team.mia, title="Still open")
    for t, due in ((early, days[2]), (late, days[0]), (open_, days[2])):
        await Task.find({"_id": PydanticObjectId(t["id"])}).update({"$set": {"due_date": due}})
    await approve(early["id"], days[0])  # a day or two before its due date
    await approve(late["id"], days[2])  # two days after its due date

    await TaskActivity(task_id=PydanticObjectId(late["id"]), subfolder_id=team.design.id, project_id=team.project.id, kind="change_request", author_id=team.hana.user.id, resolved=True, resolved_at=at(days[2])).insert()
    await TimeLog(task_id=PydanticObjectId(early["id"]), user_id=team.mia.user.id, started_at=at(days[0]), ended_at=at(days[0], 11), seconds=7200, running=False).insert()
    await TimeLog(task_id=PydanticObjectId(late["id"]), user_id=team.mia.user.id, started_at=at(days[1]), ended_at=at(days[1], 10), seconds=3600, running=False).insert()

    r = await client.get(url(team.mia.user), headers=team.mia.headers)
    assert r.status_code == 200, r.text
    rep = r.json()
    assert rep["state"] == "in_progress" and rep["person"]["name"] == "Mia Member"
    a = rep["attendance"]
    assert (a["present"], a["wfh"], a["leave"], a["half_day"]) == (1, 1, 1, 0)
    assert a["avg_login"] == "10:30"  # 9:30, 10:30, 11:30 -> the first-set times, not the later changes
    assert [d["login_time"] for d in a["days"]] == ["09:30", "10:30", "11:30"]
    t = rep["tasks"]
    passed = days[2] < today.isoformat()  # "Still open" was due on the 3rd: overdue once that day has passed
    assert (t["assigned"], t["completed"], t["early"], t["on_time"], t["late"], t["pending"], t["overdue"]) == (3, 2, 1, 0, 1, 0 if passed else 1, 1 if passed else 0)
    assert rep["time"]["total_seconds"] == 10800 and rep["time"]["working_days"] == 2  # leave is not a working day
    assert rep["time"]["avg_seconds_per_day"] == 5400
    assert rep["changes_requested"] == 1
    assert [x["title"] for x in rep["top_tasks"]] == ["Early one", "Late one"]
    rows = {x["title"]: x for x in rep["rows"]}
    assert rows["Late one"]["result"] == "Late" and rows["Late one"]["late_days"] == 2 and rows["Late one"]["changes"] == 1 and rows["Late one"]["last_change_resolved"] == days[2]
    assert rows["Early one"]["result"] == "Early" and rows["Still open"]["result"] == ("Overdue" if passed else "Pending")
    assert rows["Early one"]["early_days"] == 2 and (rows["Still open"]["overdue_days"] > 0) == passed
    assert rep["time_by_day"] == [{"date": days[0], "seconds": 7200}, {"date": days[1], "seconds": 3600}]
    assert rep["time_by_project"][0]["seconds"] == 10800 and "/" in rep["time_by_project"][0]["name"]
    assert len(rows["Early one"]["description"]) <= 80

    listed = (await client.get(f"/reports/monthly?month={THIS}", headers=team.admin.headers)).json()["rows"]
    mia = next(x for x in listed if x["user_id"] == team.mia.id)
    assert mia["present"] == 1 and mia["on_time_pct"] == 50 and mia["total_seconds"] == 10800


async def test_a_finished_month_is_frozen_the_current_one_is_live(client, team):
    day = today_local().replace(day=1) - timedelta(days=3)  # inside last month
    await DailyStatus(user_id=team.mia.user.id, date=day.isoformat(), status="present", set_at=at(day.isoformat()), first_set_at=at(day.isoformat())).insert()
    first = (await client.get(url(team.mia.user, LAST), headers=team.mia.headers)).json()
    assert first["state"] == "final" and first["attendance"]["present"] == 1
    assert await MonthlyReport.find(MonthlyReport.month == LAST).count() == 1

    await DailyStatus.find({"user_id": team.mia.user.id}).update({"$set": {"status": "leave"}})  # history is edited later...
    again = (await client.get(url(team.mia.user, LAST), headers=team.mia.headers)).json()
    assert again["attendance"]["present"] == 1 and again["attendance"]["leave"] == 0  # ...the report does not follow
    assert again["generated_at"] == first["generated_at"]

    live1 = (await client.get(url(team.mia.user), headers=team.mia.headers)).json()
    await make_task(client, team, assignee=team.mia, title="Brand new")
    await Task.find({"title": "Brand new"}).update({"$set": {"due_date": today_local().isoformat()}})
    live2 = (await client.get(url(team.mia.user), headers=team.mia.headers)).json()
    assert live2["tasks"]["assigned"] == live1["tasks"]["assigned"] + 1


async def test_month_end_job_freezes_last_month_for_every_employee_once(team):
    await User.find_all().update({"$set": {"created_at": datetime.now(timezone.utc) - timedelta(days=90)}})  # they were here last month
    made = await finalize_previous_month()
    assert made >= 4  # mia, max, hana, vic, ollie are employees; admin and the client are not
    assert await MonthlyReport.find(MonthlyReport.month == LAST).count() == made
    assert await finalize_previous_month() == 0


async def test_pdf_and_zip_downloads(client, team):
    r = await client.get(url(team.mia.user, suffix="/pdf"), headers=team.mia.headers)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and "Monthly-Report-Mia-Member" in r.headers["content-disposition"]
    assert (await client.get(url(team.mia.user, suffix="/pdf"), headers=team.max.headers)).status_code == 403

    z = await client.get(f"/reports/monthly/all.zip?month={THIS}", headers=team.admin.headers)
    assert z.status_code == 200 and z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert any("Mia-Member" in n for n in names) and all(n.endswith(".pdf") for n in names)
    assert (await client.get(f"/reports/monthly/all.zip?month={THIS}&q=zzzz", headers=team.admin.headers)).status_code == 404


def test_plain_language_helpers():
    from app.services.monthly_report import clock12, nice_time

    assert clock12("13:17") == "1:15 PM"
    assert clock12("00:02") == "12:00 AM"
    assert clock12("09:58") == "10:00 AM"
    assert clock12(None) == "-"
    assert [nice_time(x) for x in (0, 37 * 60 + 40, 135 * 60, 24 * 3600)] == ["0m", "37m", "2h 15m", "24h"]


def test_summary_sentence_and_vs_last_month():
    from datetime import datetime, timezone

    from app.schemas.report import ReportOut
    from app.services.monthly_report import summarize, versus

    r = ReportOut(
        person={"id": "665f1c2e8b3a4d0012345678", "name": "Kanisha Prithiani", "company": "Piixel", "role": "employee"}, month="2026-11", state="in_progress",
        generated_at=datetime.now(timezone.utc),
        attendance={"present": 4, "avg_login": "13:15", "scheduled_days": 4, "days": [{"date": "2026-11-0%d" % d, "status": "present", "login_time": "13:15"} for d in range(1, 5)]},
        tasks={"assigned": 1, "pending": 1}, time={"total_seconds": 37 * 60, "working_days": 4},
        time_spent=[{"task_id": "665f1c2e8b3a4d0012345001", "title": "A", "seconds": 20 * 60}, {"task_id": "665f1c2e8b3a4d0012345002", "title": "B", "seconds": 17 * 60}],
        previous={"days_worked": 2, "avg_login": "13:00", "completed": 0, "total_seconds": 37 * 60},
    )
    assert summarize(r) == "In November (so far), Kanisha was present 4 of 4 working days, usually logged in around 1:15 PM, and tracked 37m across 2 tasks. 0 of 1 tasks completed, 1 still pending."
    v = versus(r)
    assert v["days"] == "+2 days vs last month" and v["login"] == "15m later than last month" and v["time"] == "Same as last month"
    assert versus(r.model_copy(update={"previous": None})) == {"days": None, "login": None, "completed": None, "time": None}
    empty = r.model_copy(update={"attendance": r.attendance.model_copy(update={"days": []}), "tasks": r.tasks.model_copy(update={"assigned": 0, "pending": 0}), "time": r.time.model_copy(update={"total_seconds": 0})})
    assert summarize(empty) == "No activity was recorded for Kanisha in November so far."

