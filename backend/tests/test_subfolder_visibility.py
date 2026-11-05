"""Subfolder visibility: private (default), view_only and open, and that a hidden subfolder never comes back in any response."""
from types import SimpleNamespace

import pytest_asyncio

from app.core.db import migrate_subfolders
from app.models import Company, Project, Requirement, Subfolder, Task
from app.models.requirement import Requirement  # noqa: F811


@pytest_asyncio.fixture
async def team(make_user):
    """Design (head Hana, member Mia) and Video (head Vic) in a Piixel project; Pat is on Piixel but in no subfolder; Zed is on Unwork."""
    piixel = await Company(name="Piixel").insert()
    unwork = await Company(name="Unwork").insert()
    admin = await make_user("admin", "Ada Admin")
    hana = await make_user("employee", "Hana Head", company_id=piixel.id)
    mia = await make_user("employee", "Mia Member", company_id=piixel.id)
    vic = await make_user("employee", "Vic Video", company_id=piixel.id)
    pat = await make_user("employee", "Pat Piixel", company_id=piixel.id)
    zed = await make_user("employee", "Zed Unwork", company_id=unwork.id)
    cleo = await make_user("client", "Cleo Client")
    project = await Project(name="Acme", company_id=piixel.id, created_by=admin.user.id, client_ids=[cleo.user.id]).insert()
    ids = lambda *p: [x.user.id for x in p]  # noqa: E731
    design = await Subfolder(project_id=project.id, name="Design", head_ids=ids(hana), member_ids=ids(hana, mia), created_by=admin.user.id, company_ids=[piixel.id]).insert()
    video = await Subfolder(project_id=project.id, name="Video", head_ids=ids(vic), member_ids=ids(vic), created_by=admin.user.id, company_ids=[piixel.id]).insert()
    task = await Task(
        subfolder_id=design.id, project_id=project.id, title="Secret logo", description="x", assignee_id=mia.user.id, created_by=hana.user.id
    ).insert()
    return SimpleNamespace(admin=admin, hana=hana, mia=mia, vic=vic, pat=pat, zed=zed, cleo=cleo, project=project, design=design, video=video, task=task, piixel=piixel)


async def set_vis(client, who, sub, value):
    return await client.patch(f"/subfolders/{sub.id}/visibility", json={"visibility": value}, headers=who.headers)


def names(rows):
    return {r["name"] for r in rows}


# --- The default: private ----------------------------------------------------------------------------------
async def test_a_new_subfolder_is_private_and_only_members_and_admins_see_it(client, team):
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.mia.headers)).json()["visibility"] == "private"
    for who in (team.vic, team.pat, team.zed):  # same project / same company / other company: none of them
        assert (await client.get(f"/subfolders/{team.design.id}", headers=who.headers)).status_code == 403
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.admin.headers)).status_code == 200


async def test_hidden_subfolders_are_left_out_of_every_list(client, team):
    detail = (await client.get(f"/projects/{team.project.id}", headers=team.vic.headers)).json()
    assert names(detail["subfolders"]) == {"Video"} and detail["subfolder_count"] == 1
    tree = (await client.get("/sidebar/tree", headers=team.vic.headers)).json()
    assert [names(p["subfolders"]) for p in tree["projects"]] == [{"Video"}]
    assert (await client.get("/tasks", headers=team.vic.headers)).json() == []
    assert (await client.get(f"/tasks?subfolder_id={team.design.id}", headers=team.vic.headers)).json() == []
    # someone on no subfolder of the project does not even see the project
    assert (await client.get("/projects", headers=team.pat.headers)).json() == []
    assert (await client.get(f"/projects/{team.project.id}", headers=team.pat.headers)).status_code == 403
    assert (await client.get("/sidebar/tree", headers=team.pat.headers)).json()["projects"] == []
    # admins see everything
    assert names((await client.get(f"/projects/{team.project.id}", headers=team.admin.headers)).json()["subfolders"]) == {"Design", "Video"}


async def test_every_read_and_write_of_a_hidden_subfolder_is_refused(client, team):
    sub, vic = team.design, team.vic.headers
    assert (await client.get(f"/tasks/{team.task.id}", headers=vic)).status_code == 403
    assert (await client.get(f"/tasks/{team.task.id}/activity", headers=vic)).status_code == 403
    assert (await client.get(f"/subfolders/{sub.id}/checklist", headers=vic)).status_code == 403
    assert (await client.post(f"/subfolders/{sub.id}/checklist", json={"text": "x"}, headers=vic)).status_code == 403
    assert (await client.get(f"/subfolders/{sub.id}/deliverables", headers=vic)).status_code == 403
    assert (await client.get(f"/subfolders/{sub.id}/changes", headers=vic)).status_code == 403
    assert (await client.get(f"/subfolders/{sub.id}/files", headers=vic)).status_code == 403
    assert (await client.get(f"/timer/working/{sub.id}", headers=vic)).status_code == 403
    body = {"subfolder_id": str(sub.id), "title": "Sneaky", "description": "x", "assignee_id": team.vic.id}
    assert (await client.post("/tasks", json=body, headers=vic)).status_code == 403


# --- Changing it --------------------------------------------------------------------------------------------
async def test_only_admins_and_heads_of_that_subfolder_can_change_it(client, team):
    for who in (team.mia, team.vic, team.pat):  # a plain member, a head of another subfolder, an outsider
        assert (await set_vis(client, who, team.design, "open")).status_code == 403
    assert (await set_vis(client, team.hana, team.design, "view_only")).json()["visibility"] == "view_only"
    assert (await set_vis(client, team.admin, team.design, "private")).json()["visibility"] == "private"
    assert (await set_vis(client, team.hana, team.design, "everyone")).status_code == 422
    assert (await set_vis(client, team.hana, Subfolder(project_id=team.project.id, name="x", created_by=team.admin.user.id, id=team.task.id), "open")).status_code == 404
    fresh = await Subfolder.get(team.design.id)
    assert fresh.visibility == "private"
    out = (await client.get(f"/subfolders/{team.design.id}", headers=team.hana.headers)).json()
    assert out["can_set_visibility"] is True
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.mia.headers)).json()["can_set_visibility"] is False


# --- view_only: read, nothing else ---------------------------------------------------------------------------
async def test_view_only_lets_the_companys_team_read_but_not_work(client, team):
    await set_vis(client, team.hana, team.design, "view_only")
    sub = team.design
    for who in (team.vic, team.pat):  # on the project's company
        h = who.headers
        out = (await client.get(f"/subfolders/{sub.id}", headers=h)).json()
        assert out["visibility"] == "view_only" and out["can_work"] is False and out["can_set_visibility"] is False
        assert (await client.get(f"/tasks/{team.task.id}", headers=h)).status_code == 200
        assert [t["id"] for t in (await client.get(f"/tasks?subfolder_id={sub.id}", headers=h)).json()] == [str(team.task.id)]
        assert (await client.get(f"/subfolders/{sub.id}/checklist", headers=h)).status_code == 200
        assert (await client.get(f"/subfolders/{sub.id}/deliverables", headers=h)).status_code == 200
        assert (await client.get(f"/tasks/{team.task.id}/activity", headers=h)).status_code == 200
        # ...but cannot add or edit tasks, add checklist items or post
        assert (await client.post("/tasks", json={"subfolder_id": str(sub.id), "title": "T", "description": "x", "assignee_id": who.id}, headers=h)).status_code == 403
        assert (await client.patch(f"/tasks/{team.task.id}", json={"title": "Renamed"}, headers=h)).status_code == 403
        assert (await client.post(f"/subfolders/{sub.id}/checklist", json={"text": "x"}, headers=h)).status_code == 403
        assert (await client.post(f"/tasks/{team.task.id}/activity", json={"kind": "comment", "body": "<p>hi</p>"}, headers=h)).status_code == 403
        assert (await client.post(f"/subfolders/{sub.id}/changes", json={"kind": "change_request", "body": "<p>hi</p>"}, headers=h)).status_code == 403
    # it now shows up in their lists
    assert names((await client.get(f"/projects/{team.project.id}", headers=team.pat.headers)).json()["subfolders"]) == {"Design"}
    assert [p["name"] for p in (await client.get("/projects", headers=team.pat.headers)).json()] == ["Acme"]
    assert any(t["id"] == str(team.task.id) for t in (await client.get("/tasks", headers=team.vic.headers)).json())
    # another company still sees nothing
    assert (await client.get(f"/subfolders/{sub.id}", headers=team.zed.headers)).status_code == 403
    assert (await client.get("/projects", headers=team.zed.headers)).json() == []
    # members keep working as before
    assert (await client.post(f"/subfolders/{sub.id}/checklist", json={"text": "still works"}, headers=team.mia.headers)).status_code == 201


# --- open: work like a member --------------------------------------------------------------------------------
async def test_open_lets_the_companys_team_work_like_members(client, team):
    await set_vis(client, team.hana, team.design, "open")
    sub, h = team.design, team.pat.headers
    assert (await client.get(f"/subfolders/{sub.id}", headers=h)).json()["can_work"] is True
    made = await client.post("/tasks", json={"subfolder_id": str(sub.id), "title": "Mine", "description": "x", "assignee_id": team.pat.id}, headers=h)
    assert made.status_code == 201, made.text
    assert (await client.post("/tasks", json={"subfolder_id": str(sub.id), "title": "For Mia", "description": "x", "assignee_id": team.mia.id}, headers=h)).status_code == 403  # employees assign only themselves
    assert (await client.patch(f"/tasks/{made.json()['id']}", json={"title": "Mine, renamed"}, headers=h)).status_code == 200  # their own
    assert (await client.patch(f"/tasks/{team.task.id}", json={"title": "Not theirs"}, headers=h)).status_code == 403
    assert (await client.post(f"/subfolders/{sub.id}/checklist", json={"text": "from Pat"}, headers=h)).status_code == 201
    assert (await client.post(f"/tasks/{team.task.id}/activity", json={"kind": "comment", "body": "<p>hello</p>"}, headers=h)).status_code == 201
    # visibility itself stays with the heads and admins, and the other company stays out
    assert (await set_vis(client, team.pat, sub, "private")).status_code == 403
    assert (await client.get(f"/subfolders/{sub.id}", headers=team.zed.headers)).status_code == 403
    assert (await client.post("/tasks", json={"subfolder_id": str(sub.id), "title": "Z", "description": "x", "assignee_id": team.zed.id}, headers=team.zed.headers)).status_code == 403


async def test_going_back_to_private_hides_it_again(client, team):
    await set_vis(client, team.hana, team.design, "open")
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.pat.headers)).status_code == 200
    await set_vis(client, team.hana, team.design, "private")
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.pat.headers)).status_code == 403
    assert (await client.get("/projects", headers=team.pat.headers)).json() == []


async def test_changing_the_projects_companies_moves_who_can_see_a_shared_subfolder(client, team):
    await set_vis(client, team.hana, team.design, "view_only")
    unwork = await Company.get(team.zed.user.company_id)
    r = await client.patch(f"/projects/{team.project.id}", json={"company_ids": [str(unwork.id)]}, headers=team.admin.headers)
    assert r.status_code == 200, r.text
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.zed.headers)).status_code == 200
    assert (await client.get(f"/subfolders/{team.design.id}", headers=team.pat.headers)).status_code == 403  # Piixel is no longer on the project


# --- Other places a subfolder can leak -------------------------------------------------------------------------------
async def test_a_requirement_tag_never_names_a_hidden_subfolder(client, team):
    r = await client.post(
        f"/projects/{team.project.id}/requirements", json={"title": "Logo", "details": "Make it blue", "subfolder_id": str(team.design.id)}, headers=team.admin.headers
    )
    assert r.status_code == 201, r.text
    listed = (await client.get(f"/projects/{team.project.id}/requirements", headers=team.vic.headers)).json()["items"]
    assert [x["subfolder"] for x in listed] == [None]  # Vic is on the project, but cannot open Design
    assert (await client.get(f"/projects/{team.project.id}/requirements?subfolder_id={team.design.id}", headers=team.vic.headers)).status_code == 422
    seen = (await client.get(f"/projects/{team.project.id}/requirements", headers=team.mia.headers)).json()["items"]
    assert [x["subfolder"]["name"] for x in seen] == ["Design"]
    assert await Requirement.find_all().count() == 1


async def test_a_chat_group_does_not_name_a_subfolder_its_member_cannot_see(client, team):
    made = await client.post("/chat/groups", json={"name": "Ideas", "member_ids": [team.vic.id], "subfolder_id": str(team.design.id)}, headers=team.hana.headers)
    assert made.status_code == 201, made.text
    assert made.json()["subfolder"]["name"] == "Design"  # Hana can see it
    groups = (await client.get("/chat/groups", headers=team.vic.headers)).json()
    assert [g["subfolder"] for g in groups] == [None]  # Vic is in the group but cannot open Design
    # nobody can link a group to a subfolder they cannot work in
    assert (await client.post("/chat/groups", json={"name": "Sneaky", "member_ids": [], "subfolder_id": str(team.design.id)}, headers=team.vic.headers)).status_code in (403, 422)


async def test_presence_reaches_only_people_who_can_open_the_subfolder(client, team):
    from app.services.timer import viewers

    ids = set(await viewers(team.design))
    assert {team.hana.user.id, team.mia.user.id, team.admin.user.id} <= ids and team.vic.user.id not in ids and team.pat.user.id not in ids
    await set_vis(client, team.hana, team.design, "view_only")
    ids = set(await viewers(await Subfolder.get(team.design.id)))
    assert {team.vic.user.id, team.pat.user.id} <= ids and team.zed.user.id not in ids


# --- Migration ----------------------------------------------------------------------------------------------------------------
async def test_existing_subfolders_become_private_with_their_projects_companies(team):
    coll = Subfolder.get_motor_collection()
    await coll.update_one({"_id": team.design.id}, {"$unset": {"visibility": "", "company_ids": ""}})  # a subfolder from before this feature
    await migrate_subfolders()
    sub = await Subfolder.get(team.design.id)
    assert sub.visibility == "private" and sub.company_ids == [team.piixel.id]
    await migrate_subfolders()  # safe to run again
    assert (await Subfolder.get(team.design.id)).visibility == "private"
