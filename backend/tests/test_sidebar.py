"""Phase 10d: the sidebar tree (what each person may do at each node), remembered state, and deleting a subfolder."""
from beanie import PydanticObjectId

from app.models import ChatGroup, ChecklistItem, Notification, Requirement, Subfolder, Task, TaskActivity
from tests.test_tasks import make_task, team  # noqa: F401  (team is a fixture)


async def tree(client, who):
    r = await client.get("/sidebar/tree", headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


def project(t, name="Acme"):
    return next(p for p in t["projects"] if p["name"] == name)


def sub(p, name):
    return next(s for s in p["subfolders"] if s["name"] == name)


# --- The tree ----------------------------------------------------------------------------------------------------------
async def test_an_admin_sees_every_project_and_may_do_everything(client, team):
    t = await tree(client, team.admin)
    assert [p["name"] for p in t["projects"]] == ["Acme", "Other"]  # alphabetical
    assert t["can_create_project"] is True
    acme = project(t)
    assert acme["can_rename"] and acme["can_delete"] and acme["can_add_subfolder"] and acme["can_add_requirement"]
    design = sub(acme, "Design")
    assert all(design[k] for k in ("can_add_task", "can_add_checklist", "can_edit_deliverables", "can_chat", "can_rename", "can_delete"))
    assert [s["name"] for s in project(t, "Other")["subfolders"]] == ["Elsewhere"]
    assert sub(project(t, "Other"), "Elsewhere")["can_delete"] is False  # a project keeps its last subfolder


async def test_a_head_manages_their_subfolder_but_not_the_project(client, team):
    acme = project(await tree(client, team.hana))
    assert acme["can_rename"] is False and acme["can_delete"] is False  # admin only
    assert acme["can_add_subfolder"] is True and acme["can_add_requirement"] is True  # heads of any subfolder in the project
    design, video = sub(acme, "Design"), sub(acme, "Video")
    assert design["is_head"] and all(design[k] for k in ("can_add_task", "can_add_checklist", "can_edit_deliverables", "can_chat", "can_rename", "can_delete"))
    assert video["is_head"] is False and not any(video[k] for k in ("can_add_task", "can_add_checklist", "can_edit_deliverables", "can_chat", "can_rename", "can_delete"))


async def test_a_plain_member_gets_only_the_member_actions(client, team):
    t = await tree(client, team.mia)
    acme = project(t)
    assert t["can_create_project"] is False
    assert not any(acme[k] for k in ("can_rename", "can_delete", "can_add_subfolder", "can_add_requirement"))
    design = sub(acme, "Design")
    assert design["can_add_task"] and design["can_add_checklist"] and design["can_chat"]
    assert not any(design[k] for k in ("can_edit_deliverables", "can_rename", "can_delete"))
    video = sub(acme, "Video")  # on the project but not in this subfolder
    assert not any(video[k] for k in ("can_add_task", "can_add_checklist", "can_chat", "can_edit_deliverables", "can_rename", "can_delete"))


async def test_people_only_see_projects_they_belong_to_and_clients_get_none(client, team):
    assert [p["name"] for p in (await tree(client, team.ollie))["projects"]] == ["Other"]
    assert [p["name"] for p in (await tree(client, team.mia))["projects"]] == ["Acme"]
    assert (await client.get("/sidebar/tree", headers=team.cleo.headers)).status_code == 403
    assert (await client.get("/sidebar/tree")).status_code == 401


async def test_badges_count_my_open_tasks_per_subfolder_and_project(client, team):
    await make_task(client, team)  # Mia, Design
    done = await make_task(client, team)
    await Task.find({"_id": PydanticObjectId(done["id"])}).update({"$set": {"status": "approved"}})  # finished: not counted
    await make_task(client, team, assignee=team.max)  # someone else's
    t = await tree(client, team.mia)
    acme = project(t)
    assert acme["open_tasks"] == 1 and sub(acme, "Design")["open_tasks"] == 1 and sub(acme, "Video")["open_tasks"] == 0
    assert project(await tree(client, team.max))["open_tasks"] == 1
    assert project(await tree(client, team.admin))["open_tasks"] == 0  # the admin has none of their own


# --- Remembered state --------------------------------------------------------------------------------------------------------
async def test_open_nodes_and_order_are_saved_per_person(client, team):
    state = {"open": ["projects", "p:1", "p:1"], "order": {"projects": ["b", "a"], "p:1": ["x"]}}
    r = await client.put("/sidebar/state", json=state, headers=team.mia.headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"open": ["projects", "p:1"], "order": {"projects": ["b", "a"], "p:1": ["x"]}}  # repeats dropped
    assert (await client.get("/auth/me", headers=team.mia.headers)).json()["sidebar_state"] == r.json()
    assert (await client.get("/auth/me", headers=team.max.headers)).json()["sidebar_state"] == {}  # someone else's is untouched

    await client.put("/sidebar/state", json={"open": [], "order": {}}, headers=team.mia.headers)
    assert (await client.get("/auth/me", headers=team.mia.headers)).json()["sidebar_state"] == {"open": [], "order": {}}


async def test_state_is_validated(client, team):
    h = team.mia.headers
    assert (await client.put("/sidebar/state", json={"open": [""]}, headers=h)).status_code == 422
    assert (await client.put("/sidebar/state", json={"open": ["x" * 61]}, headers=h)).status_code == 422
    assert (await client.put("/sidebar/state", json={"open": [str(i) for i in range(301)]}, headers=h)).status_code == 422
    assert (await client.put("/sidebar/state", json={"order": {"a": [""]}}, headers=h)).status_code == 422
    assert (await client.put("/sidebar/state", json={"order": {"k" * 61: ["a"]}}, headers=h)).status_code == 422
    assert (await client.put("/sidebar/state", json={"open": ["a"]})).status_code == 401


# --- Deleting a subfolder ---------------------------------------------------------------------------------------------------------
async def delete(client, who, s):
    return await client.delete(f"/subfolders/{s.id}", headers=who.headers)


async def test_who_may_delete_a_subfolder(client, team):
    assert (await delete(client, team.mia, team.design)).status_code == 403  # a member
    assert (await delete(client, team.hana, team.video)).status_code == 403  # head of a different subfolder
    assert (await delete(client, team.cleo, team.design)).status_code == 403
    assert (await delete(client, team.hana, team.design)).status_code == 204  # its own head
    assert await Subfolder.get(team.design.id) is None
    assert (await delete(client, team.admin, team.video)).status_code == 409  # the last one in the project
    assert await Subfolder.get(team.video.id) is not None
    assert (await delete(client, team.admin, team.elsewhere)).status_code == 409


async def test_deleting_a_subfolder_takes_its_work_with_it_and_tells_the_members(client, team):
    task = await make_task(client, team)
    await ChecklistItem(subfolder_id=team.design.id, text="Pick fonts", created_by=team.mia.user.id).insert()
    req = await Requirement(project_id=team.project.id, subfolder_id=team.design.id, title="Brand colours", created_by=team.admin.user.id).insert()
    chat = await ChatGroup(name="Design chat", member_ids=[team.mia.user.id], subfolder_id=team.design.id, created_by=team.mia.user.id).insert()
    await client.post(
        f"/subfolders/{team.design.id}/changes", json={"kind": "change_request", "body": "<p>Rethink it</p>"}, headers=team.max.headers
    )

    assert (await delete(client, team.admin, team.design)).status_code == 204
    assert await Task.find_all().count() == 0 and await ChecklistItem.find_all().count() == 0 and await TaskActivity.find_all().count() == 0
    assert (await client.get(f"/tasks/{task['id']}", headers=team.admin.headers)).status_code == 404

    assert (await Requirement.get(req.id)).subfolder_id is None  # the client's request stays, untagged
    assert (await ChatGroup.get(chat.id)).subfolder_id is None  # the chat stays, unlinked

    told = {str(n.user_id) for n in await Notification.find({"type": "subfolder_deleted"}).to_list()}
    assert told == {team.hana.id, team.mia.id, team.max.id}  # every member, not the person who did it


async def test_the_tree_forgets_a_deleted_subfolder(client, team):
    await delete(client, team.hana, team.design)
    assert [s["name"] for s in project(await tree(client, team.admin))["subfolders"]] == ["Video"]
    assert (await client.get("/projects", headers=team.mia.headers)).json() == []  # Mia was only in Design
