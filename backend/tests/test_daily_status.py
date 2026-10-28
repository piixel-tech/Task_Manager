from app.core.timeutil import today_local
from app.models.daily_status import DailyStatus

TODAY = None


def today() -> str:
    return today_local().isoformat()


async def test_requires_login(client):
    assert (await client.get("/daily-status/me/today")).status_code == 401


async def test_status_is_null_until_set(client, alice):
    r = await client.get("/daily-status/me/today", headers=alice.headers)
    assert r.status_code == 200
    assert r.json()["status"] is None
    assert r.json()["date"] == today()


async def test_set_then_change_same_day_keeps_one_record(client, alice):
    r = await client.put("/daily-status/today", json={"status": "present"}, headers=alice.headers)
    assert r.status_code == 200 and r.json()["status"] == "present"

    r = await client.put("/daily-status/today", json={"status": "wfh"}, headers=alice.headers)
    assert r.json()["status"] == "wfh"

    assert (await client.get("/daily-status/me/today", headers=alice.headers)).json()["status"] == "wfh"
    assert await DailyStatus.find(DailyStatus.user_id == alice.user.id).count() == 1


async def test_invalid_status_rejected(client, alice):
    r = await client.put("/daily-status/today", json={"status": "napping"}, headers=alice.headers)
    assert r.status_code == 422


async def test_every_status_value_accepted(client, alice):
    for value in ["present", "wfh", "half_day", "leave"]:
        r = await client.put("/daily-status/today", json={"status": value}, headers=alice.headers)
        assert r.status_code == 200, value


async def test_clients_cannot_set_status(client, client_user):
    r = await client.put("/daily-status/today", json={"status": "present"}, headers=client_user.headers)
    assert r.status_code == 403


async def test_overview_lists_all_staff_with_null_for_unset(client, admin, alice, bob, client_user):
    await client.put("/daily-status/today", json={"status": "present"}, headers=alice.headers)
    await client.put("/daily-status/today", json={"status": "leave"}, headers=bob.headers)

    r = await client.get("/daily-status", headers=admin.headers)
    assert r.status_code == 200
    rows = {row["user_id"]: row for row in r.json()}
    assert set(rows) == {admin.id, alice.id, bob.id}  # clients are not part of the team
    assert rows[alice.id]["status"] == "present"
    assert rows[bob.id]["status"] == "leave"
    assert rows[admin.id]["status"] is None
    assert "password_hash" not in r.text


async def test_overview_hides_inactive_users(client, admin, alice, bob):
    bob.user.is_active = False
    await bob.user.save()
    ids = {row["user_id"] for row in (await client.get("/daily-status", headers=admin.headers)).json()}
    assert bob.id not in ids


async def test_overview_is_closed_to_clients(client, client_user):
    assert (await client.get("/daily-status", headers=client_user.headers)).status_code == 403


async def test_overview_bad_date(client, alice):
    r = await client.get("/daily-status?date=not-a-date", headers=alice.headers)
    assert r.status_code == 422


async def test_user_range_for_calendar(client, alice, bob):
    await DailyStatus(user_id=alice.user.id, date="2026-10-01", status="present").insert()
    await DailyStatus(user_id=alice.user.id, date="2026-10-15", status="leave").insert()
    await DailyStatus(user_id=alice.user.id, date="2026-11-02", status="wfh").insert()
    await DailyStatus(user_id=bob.user.id, date="2026-10-15", status="present").insert()

    r = await client.get(
        f"/daily-status/users/{alice.id}?from=2026-10-01&to=2026-10-31", headers=bob.headers
    )
    assert r.status_code == 200
    assert [(s["date"], s["status"]) for s in r.json()] == [("2026-10-01", "present"), ("2026-10-15", "leave")]


async def test_user_range_validation(client, alice):
    bad = await client.get(f"/daily-status/users/{alice.id}?from=2026-10-31&to=2026-10-01", headers=alice.headers)
    assert bad.status_code == 422
    too_long = await client.get(f"/daily-status/users/{alice.id}?from=2026-01-01&to=2026-12-31", headers=alice.headers)
    assert too_long.status_code == 422
