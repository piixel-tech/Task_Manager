from datetime import timedelta

from app.core.timeutil import today_local
from app.models.daily_status import DailyStatus


async def test_team_range_lists_everyones_status_per_day(client, alice, bob, admin, client_user):
    today = today_local()
    await DailyStatus(user_id=alice.user.id, date=today.isoformat(), status="wfh").insert()
    await DailyStatus(user_id=bob.user.id, date=today.isoformat(), status="leave").insert()
    await DailyStatus(user_id=bob.user.id, date=(today + timedelta(days=1)).isoformat(), status="present").insert()
    await DailyStatus(user_id=client_user.user.id, date=today.isoformat(), status="present").insert()  # clients are not part of the team view

    r = await client.get("/daily-status/team", params={"from": today.isoformat(), "to": (today + timedelta(days=1)).isoformat()}, headers=alice.headers)
    assert r.status_code == 200, r.text
    got = {(row["user_id"], row["date"]): row["status"] for row in r.json()}
    assert got[(alice.id, today.isoformat())] == "wfh" and got[(bob.id, today.isoformat())] == "leave"
    assert got[(bob.id, (today + timedelta(days=1)).isoformat())] == "present"
    assert client_user.id not in {k[0] for k in got}


async def test_team_range_rejects_bad_ranges(client, alice):
    r = await client.get("/daily-status/team", params={"from": "2026-05-10", "to": "2026-05-01"}, headers=alice.headers)
    assert r.status_code == 422
    r = await client.get("/daily-status/team", params={"from": "2026-01-01", "to": "2026-12-31"}, headers=alice.headers)
    assert r.status_code == 422
