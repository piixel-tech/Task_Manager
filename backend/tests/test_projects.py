import pytest_asyncio

from app.models import Company, Notification
from app.models.project import Project, Subfolder


@pytest_asyncio.fixture
async def company():
    return await Company(name="Piixel").insert()


@pytest_asyncio.fixture
async def carol(make_user):
    return await make_user("employee", "Carol Employee")


@pytest_asyncio.fixture
async def dave(make_user):
    return await make_user("employee", "Dave Employee")


def payload(company, heads, members=(), clients=(), name="Acme Website", sub="Design"):
    return {
        "name": name,
        "company_id": str(company.id),
        "client_ids": [c.id for c in clients],
        "first_subfolder": {"name": sub, "head_ids": [h.id for h in heads], "member_ids": [m.id for m in members]},
    }


async def make_project(client, admin, company, heads, members=(), clients=(), **kw):
    r = await client.post("/projects", json=payload(company, heads, members, clients, **kw), headers=admin.headers)
    assert r.status_code == 201, r.text
    return r.json()


async def add_subfolder(client, who, project_id, heads, members=(), name="Video"):
    body = {"name": name, "head_ids": [h.id for h in heads], "member_ids": [m.id for m in members]}
    return await client.post(f"/projects/{project_id}/subfolders", json=body, headers=who.headers)


# --- Creating projects ------------------------------------------------------------------
async def test_admin_creates_project_with_first_subfolder_and_head(client, admin, alice, bob, company):
    data = await make_project(client, admin, company, heads=[alice], members=[bob])
    assert data["name"] == "Acme Website" and data["subfolder_count"] == 1
    sub = data["subfolders"][0]
    assert [h["id"] for h in sub["heads"]] == [alice.id]
    assert {m["id"] for m in sub["members"]} == {alice.id, bob.id}  # a head is always a member
    assert sub["can_edit"] is True  # admin
    assert "password_hash" not in str(data)


async def test_only_admin_creates_projects(client, alice, client_user, company):
    for who in (alice, client_user):
        r = await client.post("/projects", json=payload(company, [alice]), headers=who.headers)
        assert r.status_code == 403


async def test_project_needs_at_least_one_head(client, admin, alice, company):
    r = await client.post("/projects", json=payload(company, [], [alice]), headers=admin.headers)
    assert r.status_code == 422


async def test_invalid_people_and_company_are_rejected_without_leaving_a_project(client, admin, alice, client_user, company):
    assert (await client.post("/projects", json=payload(company, [client_user]), headers=admin.headers)).status_code == 422
    assert (await client.post("/projects", json=payload(company, [alice], clients=[alice]), headers=admin.headers)).status_code == 422
    bad_company = payload(company, [alice])
    bad_company["company_id"] = str(alice.user.id)
    assert (await client.post("/projects", json=bad_company, headers=admin.headers)).status_code == 422
    assert await Project.find_all().count() == 0 and await Subfolder.find_all().count() == 0


async def test_creating_a_project_notifies_the_new_team_but_not_the_admin(client, admin, alice, bob, company):
    await make_project(client, admin, company, heads=[alice], members=[bob])
    notified = {n.user_id for n in await Notification.find(Notification.type == "project_added").to_list()}
    assert notified == {alice.user.id, bob.user.id}


# --- Listing and viewing -----------------------------------------------------------------
async def test_lists_only_projects_you_belong_to(client, admin, alice, bob, carol, company):
    mine = await make_project(client, admin, company, heads=[alice], name="Mine")
    await make_project(client, admin, company, heads=[bob], name="Theirs")

    assert {p["name"] for p in (await client.get("/projects", headers=admin.headers)).json()} == {"Mine", "Theirs"}
    assert [p["id"] for p in (await client.get("/projects", headers=alice.headers)).json()] == [mine["id"]]
    assert (await client.get("/projects", headers=carol.headers)).json() == []


async def test_clients_cannot_use_the_project_api_yet(client, client_user):
    assert (await client.get("/projects", headers=client_user.headers)).status_code == 403


async def test_member_sees_only_the_subfolders_they_are_in(client, admin, alice, bob, carol, company):
    project = await make_project(client, admin, company, heads=[alice], members=[bob], sub="Design")
    await add_subfolder(client, admin, project["id"], heads=[carol], name="Video")

    r = await client.get(f"/projects/{project['id']}", headers=bob.headers)  # plain member of Design
    assert r.status_code == 200
    subs = {s["name"]: s for s in r.json()["subfolders"]}
    assert set(subs) == {"Design"}  # Video is private: a sibling is not listed to someone who is not in it
    assert subs["Design"]["can_edit"] is False and r.json()["subfolder_count"] == 1
    assert r.json()["can_create_subfolder"] is False and r.json()["can_edit"] is False


async def test_head_can_edit_only_their_own_subfolder(client, admin, alice, carol, company):
    project = await make_project(client, admin, company, heads=[alice], sub="Design")
    await add_subfolder(client, admin, project["id"], heads=[carol], name="Video")

    subs = {s["name"]: s for s in (await client.get(f"/projects/{project['id']}", headers=alice.headers)).json()["subfolders"]}
    assert subs["Design"]["can_edit"] is True and subs["Design"]["viewer_is_head"] is True
    assert "Video" not in subs  # someone else's private subfolder never shows


async def test_outsiders_cannot_open_a_project_or_its_subfolders(client, admin, alice, dave, company):
    project = await make_project(client, admin, company, heads=[alice])
    sub_id = project["subfolders"][0]["id"]
    assert (await client.get(f"/projects/{project['id']}", headers=dave.headers)).status_code == 403
    assert (await client.get(f"/subfolders/{sub_id}", headers=dave.headers)).status_code == 403
    assert (await client.get(f"/subfolders/{sub_id}", headers=alice.headers)).status_code == 200


async def test_unknown_project_is_404(client, admin):
    assert (await client.get(f"/projects/{admin.id}", headers=admin.headers)).status_code == 404


# --- Creating subfolders ------------------------------------------------------------------
async def test_admin_adds_a_subfolder(client, admin, alice, bob, company):
    project = await make_project(client, admin, company, heads=[alice])
    r = await add_subfolder(client, admin, project["id"], heads=[bob])
    assert r.status_code == 201 and r.json()["name"] == "Video"


async def test_head_of_any_subfolder_in_the_project_can_create_siblings(client, admin, alice, bob, carol, company):
    project = await make_project(client, admin, company, heads=[alice])
    r = await add_subfolder(client, alice, project["id"], heads=[bob, carol], members=[carol])
    assert r.status_code == 201
    assert {h["id"] for h in r.json()["heads"]} == {bob.id, carol.id}


async def test_creating_a_subfolder_gives_the_creator_no_edit_rights(client, admin, alice, bob, company):
    project = await make_project(client, admin, company, heads=[alice])
    made = (await add_subfolder(client, alice, project["id"], heads=[bob])).json()  # alice does not appoint herself
    assert made["can_edit"] is False and made["viewer_is_head"] is False

    assert (await client.patch(f"/subfolders/{made['id']}", json={"name": "Hijack"}, headers=alice.headers)).status_code == 403
    assert (await client.patch(f"/subfolders/{made['id']}", json={"name": "Renamed"}, headers=bob.headers)).status_code == 200


async def test_a_head_may_appoint_themselves_to_the_new_subfolder(client, admin, alice, bob, company):
    project = await make_project(client, admin, company, heads=[alice])
    made = (await add_subfolder(client, alice, project["id"], heads=[alice, bob])).json()
    assert made["can_edit"] is True and made["viewer_is_head"] is True


async def test_only_heads_and_admins_create_subfolders(client, admin, alice, bob, carol, dave, company, client_user):
    project = await make_project(client, admin, company, heads=[alice], members=[bob])
    other = await make_project(client, admin, company, heads=[carol], name="Other project")

    for who in (bob, dave, client_user):  # plain member, outsider, client
        assert (await add_subfolder(client, who, project["id"], heads=[bob])).status_code == 403
    # A head of a different project has no say here.
    assert (await add_subfolder(client, carol, project["id"], heads=[carol])).status_code == 403
    assert (await add_subfolder(client, carol, other["id"], heads=[carol])).status_code == 201


async def test_new_subfolder_validates_people(client, admin, alice, client_user, company):
    project = await make_project(client, admin, company, heads=[alice])
    assert (await add_subfolder(client, admin, project["id"], heads=[])).status_code == 422
    assert (await add_subfolder(client, admin, project["id"], heads=[client_user])).status_code == 422
    assert (await add_subfolder(client, admin, project["id"], heads=[alice], members=[client_user])).status_code == 422


# --- Editing subfolders -----------------------------------------------------------------------
async def test_head_edits_name_members_and_heads(client, admin, alice, bob, carol, company):
    project = await make_project(client, admin, company, heads=[alice])
    sub_id = project["subfolders"][0]["id"]

    r = await client.patch(
        f"/subfolders/{sub_id}",
        json={"name": "Brand", "member_ids": [bob.id], "head_ids": [alice.id, carol.id]},
        headers=alice.headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Brand"
    assert {h["id"] for h in data["heads"]} == {alice.id, carol.id}
    assert {m["id"] for m in data["members"]} == {alice.id, bob.id, carol.id}  # heads stay members


async def test_sibling_head_member_and_outsider_cannot_edit(client, admin, alice, bob, carol, dave, company):
    project = await make_project(client, admin, company, heads=[alice], members=[bob], sub="Design")
    other = (await add_subfolder(client, admin, project["id"], heads=[carol], name="Video")).json()
    design_id = project["subfolders"][0]["id"]

    for who in (carol, bob, dave):  # head of the sibling, plain member, outsider
        r = await client.patch(f"/subfolders/{design_id}", json={"name": "Nope"}, headers=who.headers)
        assert r.status_code == 403, who.user.name
    assert (await client.patch(f"/subfolders/{design_id}", json={"name": "Yes"}, headers=admin.headers)).status_code == 200
    assert other["name"] == "Video"


async def test_a_subfolder_always_keeps_a_head(client, admin, alice, company):
    project = await make_project(client, admin, company, heads=[alice])
    r = await client.patch(f"/subfolders/{project['subfolders'][0]['id']}", json={"head_ids": []}, headers=alice.headers)
    assert r.status_code == 422


async def test_removing_a_member_who_is_still_head_changes_nothing(client, admin, alice, bob, company):
    project = await make_project(client, admin, company, heads=[alice], members=[bob])
    sub_id = project["subfolders"][0]["id"]
    r = await client.patch(f"/subfolders/{sub_id}", json={"member_ids": [bob.id]}, headers=alice.headers)
    assert alice.id in {m["id"] for m in r.json()["members"]}


async def test_edit_notifies_those_affected_but_not_the_editor(client, admin, alice, bob, carol, dave, company):
    project = await make_project(client, admin, company, heads=[alice], members=[bob, dave])
    sub_id = project["subfolders"][0]["id"]
    await Notification.find_all().delete()

    await client.patch(
        f"/subfolders/{sub_id}",
        json={"name": "Brand", "head_ids": [alice.id, bob.id], "member_ids": [carol.id]},  # +carol, bob -> head, dave out
        headers=alice.headers,
    )
    by_type: dict[str, set] = {}
    for n in await Notification.find_all().to_list():
        by_type.setdefault(n.type, set()).add(n.user_id)

    assert by_type["subfolder_added"] == {carol.user.id}
    assert by_type["head_appointed"] == {bob.user.id}
    assert by_type["subfolder_removed"] == {dave.user.id}
    assert alice.user.id not in {u for ids in by_type.values() for u in ids}  # the editor


async def test_subfolder_patch_validates_people(client, admin, alice, client_user, company):
    project = await make_project(client, admin, company, heads=[alice])
    r = await client.patch(
        f"/subfolders/{project['subfolders'][0]['id']}", json={"member_ids": [client_user.id]}, headers=alice.headers
    )
    assert r.status_code == 422


# --- Editing and deleting projects --------------------------------------------------------------
async def test_only_admin_edits_a_project(client, admin, alice, company, client_user):
    project = await make_project(client, admin, company, heads=[alice])
    url = f"/projects/{project['id']}"
    assert (await client.patch(url, json={"name": "X"}, headers=alice.headers)).status_code == 403  # even a head

    r = await client.patch(url, json={"name": "Renamed", "client_ids": [client_user.id]}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
    assert [c["id"] for c in r.json()["clients"]] == [client_user.id]

    types = {n.type: n.user_id for n in await Notification.find_all().to_list() if n.type in ("project_renamed",)}
    assert types["project_renamed"] == alice.user.id
    assert any(n.user_id == client_user.user.id and n.type == "project_added" for n in await Notification.find_all().to_list())


async def test_project_clients_must_be_client_accounts(client, admin, alice, bob, company):
    project = await make_project(client, admin, company, heads=[alice])
    r = await client.patch(f"/projects/{project['id']}", json={"client_ids": [bob.id]}, headers=admin.headers)
    assert r.status_code == 422


async def test_only_admin_deletes_a_project_and_its_subfolders_go_too(client, admin, alice, bob, company):
    project = await make_project(client, admin, company, heads=[alice], members=[bob])
    url = f"/projects/{project['id']}"
    assert (await client.delete(url, headers=alice.headers)).status_code == 403
    assert await Project.find_all().count() == 1

    await Notification.find_all().delete()
    assert (await client.delete(url, headers=admin.headers)).status_code == 204
    assert await Project.find_all().count() == 0 and await Subfolder.find_all().count() == 0
    assert {n.user_id for n in await Notification.find(Notification.type == "project_deleted").to_list()} == {
        alice.user.id,
        bob.user.id,
    }
    assert (await client.delete(url, headers=admin.headers)).status_code == 404


# --- Directory and client access -------------------------------------------------------------------
async def test_directory_lists_active_team_for_pickers(client, admin, alice, bob, client_user):
    bob.user.is_active = False
    await bob.user.save()
    r = await client.get("/users/directory", headers=alice.headers)
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()}
    assert ids == {admin.id, alice.id}
    assert "email" not in r.json()[0] and "password_hash" not in r.text
    assert (await client.get("/users/directory", headers=client_user.headers)).status_code == 403
    assert (await client.get("/users/directory")).status_code == 401


async def test_clients_can_book_and_view_only_their_project_team(client, admin, alice, bob, client_user, company):
    from datetime import datetime, timedelta

    from app.core.timeutil import tz

    await make_project(client, admin, company, heads=[alice], clients=[client_user])  # alice is on the team, bob is not
    start = (datetime.now(tz()) + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
    body = lambda host: {  # noqa: E731
        "host_user_id": host.id,
        "start": start.isoformat(),
        "end": (start + timedelta(hours=1)).isoformat(),
        "title": "Review",
    }
    assert (await client.post("/bookings", json=body(alice), headers=client_user.headers)).status_code == 201
    assert (await client.post("/bookings", json=body(bob), headers=client_user.headers)).status_code == 403

    day = start.date().isoformat()
    ok = await client.get(f"/bookings?host_user_id={alice.id}&from={day}&to={day}", headers=client_user.headers)
    assert ok.status_code == 200 and ok.json()[0]["title"] == "Review"  # their own booking
    no = await client.get(f"/bookings?host_user_id={bob.id}&from={day}&to={day}", headers=client_user.headers)
    assert no.status_code == 403
    assert (await client.get(f"/daily-status/users/{alice.id}?from={day}&to={day}", headers=client_user.headers)).status_code == 200
    assert (await client.get(f"/daily-status/users/{bob.id}?from={day}&to={day}", headers=client_user.headers)).status_code == 403
    assert (await client.get("/daily-status", headers=client_user.headers)).status_code == 403  # the staff overview


async def test_overview_flags_heads_per_subfolder(client, admin, alice, bob, company):
    await make_project(client, admin, company, heads=[alice], members=[bob])
    rows = {r["user_id"]: r for r in (await client.get("/daily-status", headers=bob.headers)).json()}
    assert rows[alice.id]["is_head"] is True  # head of a subfolder
    assert rows[bob.id]["is_head"] is False  # plain member
    assert rows[alice.id]["role"] == "employee"  # "head" is never an account role


# --- Start date, short description, more than one company -----------------------------------------------
async def test_start_date_and_description_are_optional_and_saved(client, admin, alice, company):
    plain = await make_project(client, admin, company, heads=[alice])
    assert plain["start_date"] is None and plain["description"] == "" and plain["company_ids"] == [str(company.id)]

    body = payload(company, [alice], name="With extras")
    body.update(start_date="2026-11-03", description="  Rebuild of the marketing site  ")
    r = await client.post("/projects", json=body, headers=admin.headers)
    assert r.status_code == 201, r.text
    assert r.json()["start_date"] == "2026-11-03" and r.json()["description"] == "Rebuild of the marketing site"

    r = await client.patch(f"/projects/{r.json()['id']}", json={"start_date": None, "description": "Short"}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["start_date"] is None and r.json()["description"] == "Short"

    too_long = payload(company, [alice], name="Long")
    too_long["description"] = "x" * 201
    assert (await client.post("/projects", json=too_long, headers=admin.headers)).status_code == 422


async def test_a_project_can_belong_to_several_companies(client, admin, alice, bob, company):
    other = await Company(name="Unwork").insert()
    body = payload(company, [alice], [bob], name="Shared")
    body["company_ids"] = [str(other.id), str(company.id)]
    r = await client.post("/projects", json=body, headers=admin.headers)
    assert r.status_code == 201, r.text
    assert r.json()["company_id"] == str(other.id) and r.json()["company_ids"] == [str(other.id), str(company.id)]
    # members from either company see it: visibility still follows the subfolder team
    for who in (alice, bob):
        listed = await client.get("/projects", headers=who.headers)
        assert [p["name"] for p in listed.json()] == ["Shared"]

    r = await client.patch(f"/projects/{r.json()['id']}", json={"company_ids": [str(company.id)]}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["company_ids"] == [str(company.id)]
    bad = payload(company, [alice], name="Bad")
    bad["company_ids"] = [str(company.id), str(alice.user.id)]
    assert (await client.post("/projects", json=bad, headers=admin.headers)).status_code == 422
