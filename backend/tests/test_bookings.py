import asyncio
from datetime import datetime, timedelta

from app.core.timeutil import tz
from app.models import Notification
from app.models.daily_status import DailyStatus


def slot(days_ahead: int = 2, hour: int = 10, minutes: int = 60) -> tuple[str, str]:
    """A future slot in the office timezone, as ISO strings with offset."""
    start = (datetime.now(tz()) + timedelta(days=days_ahead)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return start.isoformat(), (start + timedelta(minutes=minutes)).isoformat()


def body(host, start, end, title="Sync"):
    return {"host_user_id": host.id, "start": start, "end": end, "title": title, "note": "private note"}


async def book(client, who, host, start, end, title="Sync"):
    return await client.post("/bookings", json=body(host, start, end, title), headers=who.headers)


def day_range(days_ahead: int = 2) -> str:
    d = (datetime.now(tz()) + timedelta(days=days_ahead)).date().isoformat()
    return f"from={d}&to={d}"


async def test_requires_login(client, alice):
    s, e = slot()
    assert (await client.post("/bookings", json=body(alice, s, e))).status_code == 401


async def test_book_free_slot_and_notify_host(client, alice, bob):
    s, e = slot()
    r = await book(client, bob, alice, s, e)
    assert r.status_code == 201
    data = r.json()
    assert data["host_user_id"] == alice.id and data["booked_by"] == bob.id

    notes = await Notification.find(Notification.user_id == alice.user.id).to_list()
    assert len(notes) == 1
    assert notes[0].type == "booking_created"
    assert notes[0].actor_id == bob.user.id
    assert notes[0].link == f"/app/calendar/{alice.id}"


async def test_overlapping_bookings_rejected(client, alice, bob, admin):
    s, e = slot(hour=10, minutes=60)  # 10:00-11:00
    assert (await book(client, bob, alice, s, e)).status_code == 201

    # same slot, partial overlaps at both ends, and fully containing it
    for hour, minutes in [(10, 60), (9, 90), (10, 120), (9, 180)]:
        s2, e2 = slot(hour=hour, minutes=minutes)
        r = await book(client, admin, alice, s2, e2)
        assert r.status_code == 409, (hour, minutes)
        assert "overlaps" in r.json()["detail"]


async def test_back_to_back_bookings_allowed(client, alice, bob, admin):
    s1, e1 = slot(hour=10, minutes=60)
    s2, e2 = slot(hour=11, minutes=60)  # starts exactly when the first ends
    s0, e0 = slot(hour=9, minutes=60)  # ends exactly when the first starts
    assert (await book(client, bob, alice, s1, e1)).status_code == 201
    assert (await book(client, admin, alice, s2, e2)).status_code == 201
    assert (await book(client, admin, alice, s0, e0)).status_code == 201


async def test_same_time_with_different_hosts_is_fine(client, alice, bob, admin):
    s, e = slot()
    assert (await book(client, admin, alice, s, e)).status_code == 201
    assert (await book(client, admin, bob, s, e)).status_code == 201


async def test_cancelled_slot_becomes_free_again(client, alice, bob, admin):
    s, e = slot()
    first = (await book(client, bob, alice, s, e)).json()
    assert (await client.delete(f"/bookings/{first['id']}", headers=bob.headers)).status_code == 204
    assert (await book(client, admin, alice, s, e)).status_code == 201


async def test_simultaneous_requests_book_only_once(client, alice, bob, admin):
    s, e = slot()
    results = await asyncio.gather(book(client, bob, alice, s, e), book(client, admin, alice, s, e))
    assert sorted(r.status_code for r in results) == [201, 409]


async def test_validation_rules(client, alice, bob):
    past_start = (datetime.now(tz()) - timedelta(hours=3)).isoformat()
    past_end = (datetime.now(tz()) - timedelta(hours=2)).isoformat()
    assert (await book(client, bob, alice, past_start, past_end)).status_code == 422

    s, e = slot(minutes=10)
    assert (await book(client, bob, alice, s, e)).status_code == 422  # too short

    s, e = slot(hour=8, minutes=9 * 60)
    assert (await book(client, bob, alice, s, e)).status_code == 422  # too long

    s, e = slot(hour=23, minutes=120)
    assert (await book(client, bob, alice, s, e)).status_code == 422  # crosses midnight

    s, e = slot()
    assert (await book(client, bob, alice, e, s)).status_code == 422  # end before start

    naive = (datetime.now() + timedelta(days=2)).replace(microsecond=0)
    r = await book(client, bob, alice, naive.isoformat(), (naive + timedelta(hours=1)).isoformat())
    assert r.status_code == 422  # no timezone offset


async def test_cannot_book_yourself(client, alice):
    s, e = slot()
    assert (await book(client, alice, alice, s, e)).status_code == 400


async def test_clients_without_a_project_cannot_book_and_cannot_be_hosts(client, alice, client_user):
    s, e = slot()
    assert (await book(client, client_user, alice, s, e)).status_code == 403
    assert (await book(client, alice, client_user, s, e)).status_code == 404


async def test_unknown_or_inactive_host(client, alice, bob):
    s, e = slot()
    bob.user.is_active = False
    await bob.user.save()
    assert (await book(client, alice, bob, s, e)).status_code == 404


async def test_cannot_book_someone_on_leave(client, alice, bob):
    s, e = slot()
    day = s[:10]
    await DailyStatus(user_id=alice.user.id, date=day, status="leave").insert()
    r = await book(client, bob, alice, s, e)
    assert r.status_code == 409
    assert "leave" in r.json()["detail"]

    await DailyStatus.find_all().delete()
    await DailyStatus(user_id=alice.user.id, date=day, status="half_day").insert()
    assert (await book(client, bob, alice, s, e)).status_code == 201  # half day is still bookable


async def test_busy_for_everyone_details_for_people_involved(client, alice, bob, admin, make_user):
    carol = await make_user("employee", "Carol Employee")
    s, e = slot()
    assert (await book(client, bob, alice, s, e, title="Design review")).status_code == 201

    url = f"/bookings?host_user_id={alice.id}&{day_range()}"

    seen_by_carol = (await client.get(url, headers=carol.headers)).json()
    assert len(seen_by_carol) == 1
    assert seen_by_carol[0]["title"] == "Busy" and seen_by_carol[0]["note"] == ""

    for person in (alice, bob, admin):
        row = (await client.get(url, headers=person.headers)).json()[0]
        assert row["title"] == "Design review" and row["note"] == "private note"


async def test_list_only_returns_requested_range_and_host(client, alice, bob):
    s1, e1 = slot(days_ahead=2)
    s2, e2 = slot(days_ahead=5)
    await book(client, bob, alice, s1, e1)
    await book(client, bob, alice, s2, e2)
    await book(client, alice, bob, s1, e1)

    rows = (await client.get(f"/bookings?host_user_id={alice.id}&{day_range(2)}", headers=bob.headers)).json()
    assert len(rows) == 1 and rows[0]["host_user_id"] == alice.id


async def test_calendars_are_closed_to_clients_without_a_shared_project(client, alice, client_user):
    r = await client.get(f"/bookings?host_user_id={alice.id}&{day_range()}", headers=client_user.headers)
    assert r.status_code == 403


async def test_cancel_permissions_and_notification(client, alice, bob, admin, make_user):
    carol = await make_user("employee", "Carol Employee")
    s, e = slot()
    booking = (await book(client, bob, alice, s, e)).json()
    await Notification.find_all().delete()

    assert (await client.delete(f"/bookings/{booking['id']}", headers=carol.headers)).status_code == 403
    assert (await client.delete(f"/bookings/{booking['id']}", headers=alice.headers)).status_code == 204

    notes = await Notification.find_all().to_list()
    assert [n.user_id for n in notes] == [bob.user.id]  # the booker is told, not the canceller
    assert notes[0].type == "booking_cancelled"

    assert (await client.delete(f"/bookings/{booking['id']}", headers=alice.headers)).status_code == 404


async def test_admin_can_cancel_anything(client, alice, bob, admin):
    s, e = slot()
    booking = (await book(client, bob, alice, s, e)).json()
    assert (await client.delete(f"/bookings/{booking['id']}", headers=admin.headers)).status_code == 204
    notified = {n.user_id for n in await Notification.find(Notification.type == "booking_cancelled").to_list()}
    assert notified == {alice.user.id, bob.user.id}
