from datetime import timedelta

from app.core.timeutil import today_local
from app.models import Workspace
from app.services import festivals


async def _clear():
    ws = await Workspace.find_one()
    if ws:
        ws.festival = None
        await ws.save()


def _body(start, end, **extra):
    light = next(p for p in festivals.presets() if p["key"] == "diwali")["light"]
    return {"name": "Diwali", "emoji": "🪔", "preset": "diwali", "start_date": start.isoformat(), "end_date": end.isoformat(), "light": light, **extra}


async def test_presets_cover_the_festivals_and_are_readable(client, admin):
    r = await client.get("/festival/presets", headers=admin.headers)
    assert r.status_code == 200
    names = {p["name"] for p in r.json()}
    assert {"Diwali", "Holi", "Navratri", "Ganesh Chaturthi", "Eid", "Christmas", "New Year", "Independence Day", "Republic Day", "Pongal", "Onam"} <= names
    for p in r.json():
        L, D = p["light"], p["dark"]
        assert festivals.contrast(L["text"], L["bg"]) >= 7 and festivals.contrast(L["primary"], L["surface"]) >= 4.5
        assert festivals.contrast(D["text"], D["bg"]) >= 7 and festivals.contrast(D["primary"], D["surface"]) >= 4.5


async def test_only_admins_manage_it(client, alice):
    assert (await client.get("/festival/presets", headers=alice.headers)).status_code == 403
    assert (await client.put("/festival", json=_body(today_local(), today_local()), headers=alice.headers)).status_code == 403
    assert (await client.delete("/festival", headers=alice.headers)).status_code == 403


async def test_publish_applies_during_the_dates_for_everyone_and_ends_by_itself(client, admin, alice, client_user):
    await _clear()
    today = today_local()
    r = await client.put("/festival", json=_body(today, today + timedelta(days=2)), headers=admin.headers)
    assert r.status_code == 200 and r.json()["state"] == "live"
    for who in (alice, client_user, admin):
        a = (await client.get("/festival/active", headers=who.headers)).json()
        assert a["name"] == "Diwali" and set(a["light"]) == set(festivals.KEYS) and set(a["dark"]) == set(festivals.KEYS)

    ws = await Workspace.find_one()  # past its end date: gone for everyone without anyone doing anything
    ws.festival = {**ws.festival, "start_date": (today - timedelta(days=5)).isoformat(), "end_date": (today - timedelta(days=1)).isoformat()}
    await ws.save()
    assert (await client.get("/festival/active", headers=alice.headers)).json() is None
    assert (await client.get("/festival", headers=admin.headers)).json()["state"] == "ended"


async def test_future_festival_waits_for_its_start(client, admin, alice):
    await _clear()
    today = today_local()
    r = await client.put("/festival", json=_body(today + timedelta(days=3), today + timedelta(days=4)), headers=admin.headers)
    assert r.json()["state"] == "scheduled"
    assert (await client.get("/festival/active", headers=alice.headers)).json() is None


async def test_custom_colours_are_made_readable_and_validated(client, admin, alice):
    await _clear()
    today = today_local()
    ugly = {"bg": "#ffffff", "surface": "#ffffff", "primary": "#ffff00", "primary-soft": "#ffffcc", "text": "#eeeeee", "text-muted": "#dddddd", "border": "#eeeeee", "accent": "#222222"}
    r = await client.post("/festival/preview", json={"light": ugly}, headers=admin.headers)
    L = r.json()["light"]
    assert festivals.contrast(L["text"], L["bg"]) >= 7 and festivals.contrast(L["text-muted"], L["surface"]) >= 4.5 and festivals.contrast(L["primary"], L["surface"]) >= 4.5
    assert festivals.contrast(L["text"], L["accent"]) >= 4.5
    assert (await client.post("/festival/preview", json={"light": {**ugly, "bg": "red"}}, headers=admin.headers)).status_code == 422
    assert (await client.post("/festival/preview", json={"light": {k: v for k, v in ugly.items() if k != "text"}}, headers=admin.headers)).status_code == 422

    body = {"name": "Founders Day", "start_date": today.isoformat(), "end_date": today.isoformat(), "light": ugly}
    r = await client.put("/festival", json=body, headers=admin.headers)
    assert r.status_code == 200 and r.json()["festival"]["greeting"] == "Happy Founders Day!" and r.json()["festival"]["preset"] is None


async def test_bad_dates_are_rejected_and_admin_can_end_it(client, admin, alice):
    await _clear()
    today = today_local()
    assert (await client.put("/festival", json=_body(today + timedelta(days=2), today), headers=admin.headers)).status_code == 422
    assert (await client.put("/festival", json=_body(today, today + timedelta(days=90)), headers=admin.headers)).status_code == 422
    assert (await client.put("/festival", json=_body(today - timedelta(days=5), today - timedelta(days=2)), headers=admin.headers)).status_code == 422
    await client.put("/festival", json=_body(today, today), headers=admin.headers)
    assert (await client.delete("/festival", headers=admin.headers)).status_code == 200
    assert (await client.get("/festival/active", headers=alice.headers)).json() is None
