from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId

from app.models import Booking, DailyStatus, Notification, Task
from app.core.timeutil import today_local
from app.services.alerts import run_digest, run_meeting_reminders, run_snoozed
from app.services.notify import notify
from tests.test_chat import live  # noqa: F401  (live is a fixture)
from tests.test_tasks import create, make_task, team  # noqa: F401  (team is a fixture)


def pushed_to(live):
    return {str(i) for to, ev, _ in live.sent if ev == "notification" for i in to}


async def test_mentions_approvals_and_overdue_are_important_the_rest_normal(team):
    uid = [team.mia.user.id]
    for kind in ("mention", "approval_answered", "client_approval", "task_overdue"):
        assert (await notify(uid, type=kind, title="x"))[0].priority == "important", kind
    for kind in ("task_assigned", "chat_group", "office_post", "booking_created"):
        assert (await notify(uid, type=kind, title="x"))[0].priority == "normal", kind


async def test_a_muted_subfolder_is_quiet_live_but_still_in_the_bell(client, team, live):
    key = "subfolder:" + "a" * 24
    r = await client.put("/me/mutes", json={"key": key, "duration": "8h"}, headers=team.mia.headers)
    assert r.status_code == 200 and key in r.json()
    assert key in (await client.get("/me/mutes", headers=team.mia.headers)).json()

    docs = await notify([team.mia.user.id], type="task_assigned", title="x", mute_key=key)
    assert len(docs) == 1  # kept in the bell
    assert team.mia.id not in pushed_to(live)  # but no live popup or sound
    # important ones ignore the mute
    await notify([team.mia.user.id], type="mention", title="@you", mute_key=key)
    assert team.mia.id in pushed_to(live)

    await client.put("/me/mutes", json={"key": key, "duration": "off"}, headers=team.mia.headers)
    assert (await client.get("/me/mutes", headers=team.mia.headers)).json() == {}


async def test_mute_rejects_bad_input_and_expires(client, team):
    assert (await client.put("/me/mutes", json={"key": "chat:nope", "duration": "8h"}, headers=team.mia.headers)).status_code == 422
    assert (await client.put("/me/mutes", json={"key": "chat:" + "b" * 24, "duration": "5y"}, headers=team.mia.headers)).status_code == 422
    from app.models import User

    user = await User.get(PydanticObjectId(team.mia.id))
    user.mutes = {"chat:" + "c" * 24: (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
    await user.save()
    assert (await client.get("/me/mutes", headers=team.mia.headers)).json() == {}


async def test_snooze_brings_a_notification_back_unread(client, team, live):
    await notify([team.mia.user.id], type="task_assigned", title="Review the logo")
    doc = await Notification.find_one({"user_id": team.mia.user.id, "title": "Review the logo"})
    r = await client.post(f"/notifications/{doc.id}/snooze", json={"minutes": 60}, headers=team.mia.headers)
    assert r.status_code == 200, r.text
    again = await Notification.get(doc.id)
    assert again.read and again.snoozed_until is not None
    assert (await client.post(f"/notifications/{doc.id}/snooze", json={"minutes": 60}, headers=team.max.headers)).status_code == 404  # not yours

    assert await run_snoozed() == 0  # too early
    assert await run_snoozed(datetime.now(timezone.utc) + timedelta(minutes=61)) == 1
    back = await Notification.get(doc.id)
    assert not back.read and back.snoozed_until is None and back.title == "Reminder: Review the logo"
    assert team.mia.id in pushed_to(live)
    assert await run_snoozed(datetime.now(timezone.utc) + timedelta(minutes=61)) == 0  # only once


async def test_only_important_office_posts_notify_the_team(client, team):
    await client.post("/office/posts", json={"text": "Coffee is finished"}, headers=team.mia.headers)
    assert await Notification.find({"type": "office_post"}).count() == 0
    r = await client.post("/office/posts", json={"text": "Fire drill at 3", "important": True}, headers=team.mia.headers)
    assert r.status_code == 201, r.text
    assert await Notification.find({"type": "office_post"}).count() > 0
    assert await Notification.find({"type": "office_post", "user_id": PydanticObjectId(team.mia.id)}).count() == 0  # not your own


async def test_meeting_reminder_goes_out_once_ten_minutes_before(team):
    start = datetime.now(timezone.utc) + timedelta(minutes=8)
    b = await Booking(host_user_id=team.mia.user.id, booked_by=team.max.user.id, start=start, end=start + timedelta(minutes=30), title="Kickoff").insert()
    far = await Booking(host_user_id=team.mia.user.id, booked_by=team.max.user.id, start=start + timedelta(hours=2), end=start + timedelta(hours=3), title="Later").insert()
    assert await run_meeting_reminders() == 1
    assert await Notification.find({"type": "booking_starting"}).count() == 2  # host and booker
    assert (await Booking.get(b.id)).remind_sent and not (await Booking.get(far.id)).remind_sent
    assert await run_meeting_reminders() == 0


async def test_digest_summarises_the_day_once_and_stays_quiet_when_empty(client, team):
    task = await make_task(client, team, assignee=team.max)
    await Task.find({"_id": PydanticObjectId(task["id"])}).update({"$set": {"due_date": today_local().isoformat()}})
    await DailyStatus(user_id=team.mia.user.id, date=today_local().isoformat(), status="leave").insert()
    await run_digest()
    mine = await Notification.find({"user_id": PydanticObjectId(team.max.id), "type": "daily_digest"}).to_list()
    assert len(mine) == 1 and "1 task due today" in mine[0].body and "On leave" in mine[0].body
    await run_digest()  # same day: not again
    assert await Notification.find({"user_id": PydanticObjectId(team.max.id), "type": "daily_digest"}).count() == 1


async def test_overdue_reminders_use_the_overdue_type(client, team):
    from app.services.reminders import run_reminders

    task = await make_task(client, team, assignee=team.max)
    await Task.find({"_id": PydanticObjectId(task["id"])}).update({"$set": {"due_date": (today_local() - timedelta(days=2)).isoformat()}})
    await run_reminders()
    assert await Notification.find({"user_id": PydanticObjectId(team.max.id), "type": "task_overdue"}).count() == 1
