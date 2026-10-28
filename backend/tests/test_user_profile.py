"""GET /users/{id}/profile: one profile view for admins, employees and clients."""
from app.models import Company, Project, Subfolder
from app.core.timeutil import today_local
from app.models.daily_status import DailyStatus


async def test_requires_login(client, alice):
    assert (await client.get(f"/users/{alice.id}/profile")).status_code == 401


async def test_staff_see_the_profile_with_todays_status_and_no_private_details(client, make_user, bob):
    acme = Company(name="Acme")
    await acme.insert()
    ann = await make_user("employee", "Ann Able", title="Designer", bio="Loves type.", company_id=acme.id)
    await DailyStatus(user_id=ann.user.id, date=today_local().isoformat(), status="wfh").insert()

    for viewer in (bob, await make_user("admin", "Ada Admin")):
        r = await client.get(f"/users/{ann.id}/profile", headers=viewer.headers)
        assert r.status_code == 200
        assert r.json() == {
            "id": ann.id, "name": "Ann Able", "role": "employee", "avatar_url": None, "title": "Designer",
            "bio": "Loves type.", "company": "Acme", "status": "wfh", "in_focus": False,
        }
    assert "email" not in r.text and "phone" not in r.text and "password" not in r.text


async def test_status_is_empty_when_not_set_and_unknown_people_are_404(client, alice, bob):
    assert (await client.get(f"/users/{alice.id}/profile", headers=bob.headers)).json()["status"] is None
    assert (await client.get("/users/64b000000000000000000000/profile", headers=bob.headers)).status_code == 404


async def test_a_client_sees_themselves_and_their_project_team_only(client, make_user, alice, bob, admin, client_user):
    assert (await client.get(f"/users/{client_user.id}/profile", headers=client_user.headers)).status_code == 200
    assert (await client.get(f"/users/{alice.id}/profile", headers=client_user.headers)).status_code == 404  # no shared project

    project = Project(name="P", company_id=admin.user.id, client_ids=[client_user.user.id], created_by=admin.user.id)
    await project.insert()
    await Subfolder(project_id=project.id, name="S", head_ids=[alice.user.id], member_ids=[alice.user.id], created_by=admin.user.id).insert()
    r = await client.get(f"/users/{alice.id}/profile", headers=client_user.headers)
    assert r.status_code == 200 and r.json()["name"] == alice.user.name and r.json()["status"] is None
    assert (await client.get(f"/users/{bob.id}/profile", headers=client_user.headers)).status_code == 404  # not on their project


async def test_staff_can_open_a_clients_profile_which_has_no_status(client, alice, client_user):
    r = await client.get(f"/users/{client_user.id}/profile", headers=alice.headers)
    assert r.status_code == 200 and r.json()["role"] == "client" and r.json()["status"] is None
