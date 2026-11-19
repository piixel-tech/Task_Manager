"""Birthdays, work milestones and festival greetings."""
from datetime import date

from app.core.timeutil import today_local
from app.services.celebrations import is_birthday, milestone_label, milestone_months


# --- the date rules (no database) ---------------------------------------------------------------------------------------------
def test_birthday_matches_day_and_month_and_29_feb_moves_to_the_28th():
    assert is_birthday("03-18", date(2026, 3, 18)) and not is_birthday("03-18", date(2026, 3, 19))
    assert is_birthday("02-29", date(2028, 2, 29)) and not is_birthday("02-29", date(2028, 2, 28))
    assert is_birthday("02-29", date(2027, 2, 28)) and not is_birthday("02-29", date(2027, 3, 1))
    assert not is_birthday("", date(2026, 3, 18))


def test_milestones_are_1_3_6_months_then_every_year_and_never_on_the_join_day():
    joined = "2025-05-31"
    assert milestone_months(joined, date(2025, 5, 31)) is None
    assert milestone_months(joined, date(2025, 6, 30)) == 1  # no 31 June: marked on the last day
    assert milestone_months(joined, date(2025, 7, 31)) is None  # 2 months
    assert milestone_months(joined, date(2025, 8, 31)) == 3
    assert milestone_months(joined, date(2025, 11, 30)) == 6
    assert milestone_months(joined, date(2026, 5, 31)) == 12
    assert milestone_months(joined, date(2028, 5, 31)) == 36
    assert milestone_months(joined, date(2026, 6, 30)) is None
    assert milestone_months("junk", date(2026, 6, 30)) is None


def test_labels():
    assert milestone_label(1, "Piixel") == "1 month with Piixel"
    assert milestone_label(6, None) == "6 months on the team"
    assert milestone_label(12, "Unwork") == "1 year with Unwork"
    assert milestone_label(24, "Unwork") == "2 years with Unwork"


# --- profile fields ------------------------------------------------------------------------------------------------------------
async def test_birthday_and_joining_date_are_saved_validated_and_the_year_stays_private(client, alice, bob, admin):
    r = await client.patch("/me/profile", json={"birthday": "03-18", "birth_year": 1994, "joined_on": "2024-01-15"}, headers=alice.headers)
    assert r.status_code == 200, r.text
    assert r.json()["birthday"] == "03-18" and r.json()["birth_year"] == 1994 and r.json()["joined_on"] == "2024-01-15"

    seen = (await client.get(f"/users/{alice.id}/profile", headers=bob.headers)).json()
    assert seen["birthday"] == "03-18" and seen["joined_on"] == "2024-01-15"
    assert "birth_year" not in seen

    for bad in ({"birthday": "02-30"}, {"birthday": "13-01"}, {"birthday": "1994-03-18"}, {"joined_on": "nope"}, {"joined_on": "2999-01-01"}, {"birth_year": 1800}):
        assert (await client.patch("/me/profile", json=bad, headers=alice.headers)).status_code == 422, bad

    # clearing the birthday forgets the year too
    r = await client.patch("/me/profile", json={"birthday": ""}, headers=alice.headers)
    assert r.json()["birthday"] == "" and r.json()["birth_year"] is None

    # an admin can edit both for anybody
    r = await client.patch(f"/users/{bob.id}", json={"birthday": "12-25", "joined_on": "2023-06-01"}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["birthday"] == "12-25" and r.json()["joined_on"] == "2023-06-01"
    assert (await client.patch(f"/users/{bob.id}", json={"birthday": "12-25"}, headers=alice.headers)).status_code == 403


async def test_joining_date_defaults_to_the_day_the_account_was_made(client, alice, bob):
    seen = (await client.get(f"/users/{alice.id}/profile", headers=bob.headers)).json()
    assert seen["joined_on"] == alice.user.created_at.date().isoformat()


# --- today's celebrations ------------------------------------------------------------------------------------------------------
async def test_today_lists_birthdays_and_milestones_for_the_team_and_nothing_for_clients(client, alice, bob, admin, client_user):
    today = today_local()
    await client.patch("/me/profile", json={"birthday": today.strftime("%m-%d")}, headers=alice.headers)
    # a join date exactly a year back is a milestone on any day (except 29 Feb handled by the service)
    year_ago = today.replace(year=today.year - 1, day=28 if today.month == 2 and today.day == 29 else today.day)
    await client.patch("/me/profile", json={"joined_on": year_ago.isoformat()}, headers=bob.headers)

    got = (await client.get("/celebrations/today", headers=admin.headers)).json()
    mine = {(p["user_id"], p["kind"]) for p in got["people"]}
    assert (alice.id, "birthday") in mine
    assert (bob.id, "milestone") in mine
    assert next(p for p in got["people"] if p["user_id"] == bob.id)["label"].startswith("1 year")
    assert "birth_year" not in str(got)

    assert (await client.get("/celebrations/today", headers=client_user.headers)).json() == {"people": [], "festivals": []}
    assert (await client.get("/celebrations/today")).status_code == 401


# --- festival greetings --------------------------------------------------------------------------------------------------------
async def test_festival_greetings_are_admin_managed_and_shown_on_their_date(client, alice, admin):
    today = today_local().isoformat()
    body = {"name": "Diwali", "date": today, "message": "Happy Diwali, team!"}
    assert (await client.post("/celebrations/festivals", json=body, headers=alice.headers)).status_code == 403
    r = await client.post("/celebrations/festivals", json=body, headers=admin.headers)
    assert r.status_code == 201, r.text
    fid = r.json()["id"]
    await client.post("/celebrations/festivals", json={**body, "name": "Later", "date": "2999-01-01"}, headers=admin.headers)

    assert (await client.post("/celebrations/festivals", json={**body, "date": "tomorrow"}, headers=admin.headers)).status_code == 422
    assert (await client.post("/celebrations/festivals", json={**body, "message": "x" * 61}, headers=admin.headers)).status_code == 422

    got = (await client.get("/celebrations/today", headers=alice.headers)).json()
    assert [f["message"] for f in got["festivals"]] == ["Happy Diwali, team!"]
    assert len((await client.get("/celebrations/festivals", headers=admin.headers)).json()) == 2
    assert (await client.get("/celebrations/festivals", headers=alice.headers)).status_code == 403

    r = await client.patch(f"/celebrations/festivals/{fid}", json={**body, "message": "Shubh Diwali!"}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["message"] == "Shubh Diwali!"
    assert (await client.delete(f"/celebrations/festivals/{fid}", headers=admin.headers)).status_code == 204
    assert (await client.delete(f"/celebrations/festivals/{fid}", headers=admin.headers)).status_code == 404
    assert (await client.get("/celebrations/today", headers=alice.headers)).json()["festivals"] == []


# --- the morning notifications -------------------------------------------------------------------------------------------------
async def _titles(person, kind=None):
    from beanie import PydanticObjectId

    from app.models import Notification

    q = {"user_id": PydanticObjectId(person.id)}
    if kind:
        q["type"] = kind
    return sorted(n.title for n in await Notification.find(q).to_list())


def _at(hour):
    from datetime import datetime, time

    from app.core.timeutil import tz

    return datetime.combine(today_local(), time(hour, 30), tzinfo=tz())


async def test_morning_notifications_wish_the_person_tell_the_rest_and_never_repeat(client, alice, bob, admin, client_user):
    from app.services.celebrations import run_celebration_notifications

    await client.patch("/me/profile", json={"birthday": today_local().strftime("%m-%d")}, headers=alice.headers)

    assert await run_celebration_notifications(_at(7)) == 0  # not before 8 AM
    assert await run_celebration_notifications(_at(8)) > 0

    first = alice.user.name.split()[0]
    assert await _titles(alice, "birthday") == [f"Happy birthday, {first}! \U0001F382"]  # a wish, not "Today is your birthday"
    for other in (bob, admin):
        assert await _titles(other, "birthday") == [f"Today is {first}'s birthday"]
    assert await _titles(client_user) == []

    assert await run_celebration_notifications(_at(9)) == 0  # once a day
    assert await run_celebration_notifications(_at(15)) == 0


async def test_several_celebrations_are_one_notification_and_a_later_one_still_goes_out(client, alice, bob, admin):
    from app.services.celebrations import run_celebration_notifications

    today = today_local()
    await client.patch("/me/profile", json={"birthday": today.strftime("%m-%d")}, headers=alice.headers)
    year_ago = today.replace(year=today.year - 1, day=28 if today.month == 2 and today.day == 29 else today.day)
    await client.patch("/me/profile", json={"joined_on": year_ago.isoformat()}, headers=bob.headers)

    await run_celebration_notifications(_at(8))
    got = await _titles(admin)
    assert got == ["2 celebrations today"]  # both in one

    # someone else added later in the day is announced on its own; the first two are not repeated
    carol_born = await client.patch("/me/profile", json={"birthday": today.strftime("%m-%d")}, headers=admin.headers)
    assert carol_born.status_code == 200
    await run_celebration_notifications(_at(11))
    assert len(await _titles(alice, "birthday")) == 2  # her wish, plus the admin's birthday
    assert await _titles(admin, "birthday") == [f"Happy birthday, {admin.user.name.split()[0]}! \U0001F382"]


async def test_festival_greeting_notifies_the_team_once(client, alice, admin, client_user):
    from app.services.celebrations import run_celebration_notifications

    body = {"name": "Diwali", "date": today_local().isoformat(), "message": "Happy Diwali, team!"}
    assert (await client.post("/celebrations/festivals", json=body, headers=admin.headers)).status_code == 201
    await run_celebration_notifications(_at(8))
    await run_celebration_notifications(_at(12))
    assert await _titles(alice, "festival") == ["Diwali"]
    assert await _titles(admin, "festival") == ["Diwali"]
    assert await _titles(client_user) == []
