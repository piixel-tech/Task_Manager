from app.models import File, Notification, Project, Subfolder
from app.models.requirement import Requirement
from tests.test_tasks import team, upload  # noqa: F401  (team is a fixture)


async def put_client_on_project(team, who=None):
    who = who or team.cleo
    await Project.find({"_id": team.project.id}).update({"$addToSet": {"client_ids": who.user.id}})


def url(team):
    return f"/projects/{team.project.id}/requirements"


async def add(client, who, team, title="Homepage redesign", details="Make it pop.", **extra):
    return await client.post(url(team), json={"title": title, "details": details, **extra}, headers=who.headers)


async def made(client, who, team, **kw):
    r = await add(client, who, team, **kw)
    assert r.status_code == 201, r.text
    return r.json()


async def listing(client, who, team, **params):
    r = await client.get(url(team), params=params, headers=who.headers)
    assert r.status_code == 200, r.text
    return r.json()


# --- Adding ---------------------------------------------------------------------------------------------------------
async def test_the_client_admin_and_any_head_in_the_project_can_add(client, team):
    await put_client_on_project(team)
    expected = ((team.cleo, "client"), (team.admin, "admin"), (team.hana, "head"), (team.vic, "head"))  # Vic heads another subfolder of the project
    for who, badge in expected:
        r = await add(client, who, team, title=f"By {badge}")
        assert r.status_code == 201, (badge, r.text)
        body = r.json()
        assert body["author_badge"] == badge and body["author"]["id"] == who.id and body["title"] == f"By {badge}"
        assert body["version_count"] == 1 and body["edited"] is False and len(body["versions"]) == 1 and body["versions"][0]["current"] is True
        assert body["can_edit"] is True and body["can_delete"] is (badge == "admin")  # only admins delete


async def test_other_people_cannot_add(client, team, make_user):
    await put_client_on_project(team)
    stranger = await make_user("client", "Stranger Client")
    for who in (team.mia, team.max, team.ollie, stranger):  # plain members, an outsider's head, a client of no project
        assert (await add(client, who, team)).status_code == 403, who
    assert (await client.post(url(team), json={"title": "x", "details": "y"})).status_code == 401
    assert (await client.post(f"/projects/{team.design.id}/requirements", json={"title": "x", "details": "y"}, headers=team.admin.headers)).status_code == 404
    assert await Requirement.find_all().count() == 0


async def test_input_rules(client, team):
    await put_client_on_project(team)
    f = await upload(client, team.cleo, "brief.pdf", b"%PDF")
    link = (await client.post("/files/link", json={"title": "Figma", "url": "https://figma.com/x"}, headers=team.cleo.headers)).json()
    for body in ({}, {"title": "", "details": "x"}, {"title": "   ", "details": "x"}, {"title": "x" * 201, "details": "x"},
                 {"title": "T"}, {"title": "T", "details": "   "}, {"title": "T", "details": "x" * 10001},
                 {"title": "T", "details": "x", "subfolder_id": str(team.elsewhere.id)},  # another project's subfolder
                 {"title": "T", "details": "x", "subfolder_id": "nope"}):
        assert (await client.post(url(team), json=body, headers=team.cleo.headers)).status_code == 422, body
    theirs = await upload(client, team.hana, "h.txt")
    assert (await client.post(url(team), json={"title": "T", "details": "x", "attachment_ids": [theirs["id"]]}, headers=team.cleo.headers)).status_code == 422
    assert (await client.post(url(team), json={"title": "T", "details": "x", "attachment_ids": [str(team.design.id)]}, headers=team.cleo.headers)).status_code == 422

    only_files = await add(client, team.cleo, team, "Files only", "", attachment_ids=[f["id"], link["id"]])  # no written details is fine with attachments
    assert only_files.status_code == 201
    assert [(a["name"], a["kind"]) for a in only_files.json()["attachments"]] == [("brief.pdf", "upload"), ("Figma", "link")]
    tagged = await made(client, team.cleo, team, title="  Tagged   one ", subfolder_id=str(team.design.id))
    assert tagged["title"] == "Tagged one" and tagged["subfolder"] == {"id": str(team.design.id), "name": "Design"}
    assert (await made(client, team.cleo, team))["subfolder"] is None


async def test_a_new_requirement_notifies_project_heads_and_admins_only(client, team):
    await put_client_on_project(team)
    await Notification.find_all().delete()
    await made(client, team.cleo, team, title="Logo on dark backgrounds")
    notes = await Notification.find(Notification.type == "requirement_added").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.vic.user.id, team.admin.user.id}  # heads + admin; not members, not the client
    by = {n.user_id: n for n in notes}
    assert by[team.admin.user.id].link == f"/admin/projects/{team.project.id}?tab=requirements"
    assert by[team.hana.user.id].link == f"/app/projects/{team.project.id}?tab=requirements"
    assert "Logo on dark backgrounds" in notes[0].title and "Cleo Client" in notes[0].body

    await Notification.find_all().delete()
    await made(client, team.hana, team)  # a head adds: the other head and the admin hear, not herself
    assert {n.user_id for n in await Notification.find(Notification.type == "requirement_added").to_list()} == {team.vic.user.id, team.admin.user.id}
    await Notification.find_all().delete()
    await add(client, team.mia, team)  # refused: nobody is told
    assert await Notification.find_all().count() == 0


# --- Viewing, search, filter ------------------------------------------------------------------------------------------
async def test_who_can_read_the_record(client, team, make_user):
    await put_client_on_project(team)
    await made(client, team.cleo, team)
    stranger = await make_user("client", "Stranger Client")
    for who in (team.cleo, team.admin, team.hana, team.mia, team.max, team.vic):  # client, admin, heads, plain members
        assert (await listing(client, who, team))["total"] == 1, who
    for who in (team.ollie, stranger):
        assert (await client.get(url(team), headers=who.headers)).status_code == 403, who
    assert (await client.get(url(team))).status_code == 401
    assert (await listing(client, team.mia, team))["can_add"] is False and (await listing(client, team.hana, team))["can_add"] is True
    assert (await listing(client, team.cleo, team))["can_add"] is True


async def test_newest_first_with_search_and_subfolder_filter_and_paging(client, team):
    await put_client_on_project(team)
    await made(client, team.cleo, team, title="Brand colours", details="Use #FF5500 and navy", subfolder_id=str(team.design.id))
    await made(client, team.cleo, team, title="Video intro", details="10 seconds, upbeat", subfolder_id=str(team.video.id))
    await made(client, team.hana, team, title="Weekly (report) 100%", details="Every Friday")
    await made(client, team.admin, team, title="Misc", details="No tag")

    got = await listing(client, team.mia, team)
    assert [r["title"] for r in got["items"]] == ["Misc", "Weekly (report) 100%", "Video intro", "Brand colours"] and got["total"] == 4

    assert [r["title"] for r in (await listing(client, team.mia, team, q="NAVY"))["items"]] == ["Brand colours"]  # case-insensitive, in the details
    assert [r["title"] for r in (await listing(client, team.mia, team, q="video"))["items"]] == ["Video intro"]
    assert (await listing(client, team.mia, team, q="(report)"))["total"] == 1 and (await listing(client, team.mia, team, q="100%"))["total"] == 1
    assert (await listing(client, team.mia, team, q=".*"))["total"] == 0  # regex characters are literal
    assert [r["title"] for r in (await listing(client, team.mia, team, subfolder_id=str(team.design.id)))["items"]] == ["Brand colours"]
    assert (await listing(client, team.mia, team, q="seconds", subfolder_id=str(team.design.id)))["total"] == 0  # both filters apply

    p1 = await listing(client, team.mia, team, limit=3)
    p2 = await listing(client, team.mia, team, limit=3, skip=3)
    assert p1["total"] == 4 and len(p1["items"]) == 3 and [r["title"] for r in p2["items"]] == ["Brand colours"]
    for params in ({"limit": 0}, {"limit": 101}, {"skip": -1}, {"subfolder_id": "nope"}):
        assert (await client.get(url(team), params=params, headers=team.mia.headers)).status_code == 422, params


async def test_the_badge_follows_what_the_author_is_today(client, team):
    await put_client_on_project(team)
    await made(client, team.hana, team)
    assert (await listing(client, team.mia, team))["items"][0]["author_badge"] == "head"
    await Subfolder.find({"_id": team.design.id}).update({"$set": {"head_ids": [team.vic.user.id]}})  # Hana is no longer a head
    assert (await listing(client, team.mia, team))["items"][0]["author_badge"] == "member"


# --- Editing and history -----------------------------------------------------------------------------------------------
async def test_only_the_author_edits_and_every_edit_keeps_the_old_version(client, team):
    await put_client_on_project(team)
    old_file = await upload(client, team.cleo, "v1.pdf", b"%PDF")
    new_file = await upload(client, team.cleo, "v2.pdf", b"%PDF")
    req = await made(client, team.cleo, team, title="Logo", details="Blue logo", attachment_ids=[old_file["id"]])
    one = f"/requirements/{req['id']}"

    for who in (team.admin, team.hana, team.mia, team.vic):  # nobody else, not even an admin or a head
        assert (await client.patch(one, json={"details": "hijack"}, headers=who.headers)).status_code == 403, who
    assert (await client.patch(one, json={"details": "x"})).status_code == 401

    r = await client.patch(one, json={"details": "  Green logo  ", "attachment_ids": [new_file["id"]], "title": "Logo v2"}, headers=team.cleo.headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["title"], body["details"], body["edited"], body["version_count"]) == ("Logo v2", "Green logo", True, 2)
    assert [a["name"] for a in body["attachments"]] == ["v2.pdf"]
    assert [(v["number"], v["current"], v["title"], v["details"]) for v in body["versions"]] == [(2, True, "Logo v2", "Green logo"), (1, False, "Logo", "Blue logo")]
    assert [a["name"] for a in body["versions"][1]["attachments"]] == ["v1.pdf"]  # the old file is still there
    assert body["versions"][1]["edited_by"]["id"] == team.cleo.id and body["versions"][1]["edited_at"]

    await client.patch(one, json={"details": "Red logo"}, headers=team.cleo.headers)
    got = (await client.get(one, headers=team.mia.headers)).json()  # anyone who can view sees the history
    assert [v["details"] for v in got["versions"]] == ["Red logo", "Green logo", "Blue logo"] and got["version_count"] == 3
    assert got["can_edit"] is False and (await client.get(one, headers=team.cleo.headers)).json()["can_edit"] is True
    assert await File.get(old_file["id"]) is not None


async def test_edits_can_move_or_clear_the_subfolder_tag_and_must_leave_something(client, team):
    await put_client_on_project(team)
    req = await made(client, team.cleo, team, subfolder_id=str(team.design.id))
    one = f"/requirements/{req['id']}"
    r = await client.patch(one, json={"subfolder_id": str(team.video.id)}, headers=team.cleo.headers)
    assert r.json()["subfolder"]["name"] == "Video" and r.json()["version_count"] == 2  # a tag change is an edit too
    assert r.json()["versions"][1]["subfolder"]["name"] == "Design"
    r = await client.patch(one, json={"subfolder_id": None}, headers=team.cleo.headers)
    assert r.json()["subfolder"] is None
    r = await client.patch(one, json={"title": "Only the title"}, headers=team.cleo.headers)  # untouched fields stay
    assert r.json()["details"] == "Make it pop." and r.json()["subfolder"] is None

    assert (await client.patch(one, json={"subfolder_id": str(team.elsewhere.id)}, headers=team.cleo.headers)).status_code == 422
    assert (await client.patch(one, json={"title": ""}, headers=team.cleo.headers)).status_code == 422
    assert (await client.patch(one, json={"details": "   "}, headers=team.cleo.headers)).status_code == 422  # nothing left to say
    assert (await client.patch(one, json={"attachment_ids": [str(team.design.id)]}, headers=team.cleo.headers)).status_code == 422
    assert (await client.patch(f"/requirements/{team.design.id}", json={"title": "x"}, headers=team.cleo.headers)).status_code == 404


async def test_a_change_that_changes_nothing_adds_no_history_and_no_notice(client, team):
    await put_client_on_project(team)
    req = await made(client, team.cleo, team)
    await Notification.find_all().delete()
    r = await client.patch(f"/requirements/{req['id']}", json={"title": req["title"], "details": req["details"]}, headers=team.cleo.headers)
    assert r.status_code == 200 and r.json()["version_count"] == 1 and r.json()["edited"] is False
    assert await Notification.find_all().count() == 0


async def test_editing_notifies_heads_and_admins(client, team):
    await put_client_on_project(team)
    req = await made(client, team.cleo, team)
    await Notification.find_all().delete()
    await client.patch(f"/requirements/{req['id']}", json={"details": "Changed my mind"}, headers=team.cleo.headers)
    notes = await Notification.find(Notification.type == "requirement_updated").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.vic.user.id, team.admin.user.id}
    assert "Cleo Client" in notes[0].body and notes[0].link.endswith("?tab=requirements")


async def test_a_client_removed_from_the_project_loses_access(client, team):
    await put_client_on_project(team)
    req = await made(client, team.cleo, team)
    await Project.find({"_id": team.project.id}).update({"$pull": {"client_ids": team.cleo.user.id}})
    assert (await client.get(url(team), headers=team.cleo.headers)).status_code == 403
    assert (await client.get(f"/requirements/{req['id']}", headers=team.cleo.headers)).status_code == 403
    assert (await client.patch(f"/requirements/{req['id']}", json={"details": "x"}, headers=team.cleo.headers)).status_code == 403


# --- Deleting ------------------------------------------------------------------------------------------------------------
async def test_only_an_admin_deletes_and_it_takes_every_file_with_it(client, team):
    await put_client_on_project(team)
    a = await upload(client, team.cleo, "old.pdf", b"%PDF")
    b = await upload(client, team.cleo, "new.pdf", b"%PDF")
    req = await made(client, team.cleo, team, title="Doomed", attachment_ids=[a["id"]])
    await client.patch(f"/requirements/{req['id']}", json={"attachment_ids": [b["id"]]}, headers=team.cleo.headers)
    one = f"/requirements/{req['id']}"
    for who in (team.cleo, team.hana, team.vic, team.mia):  # not even the author, not heads
        assert (await client.delete(one, headers=who.headers)).status_code == 403, who
    assert (await client.delete(one)).status_code == 401
    assert await Requirement.find_all().count() == 1 and await File.find_all().count() == 2

    await Notification.find_all().delete()
    assert (await client.delete(one, headers=team.admin.headers)).status_code == 204
    assert await Requirement.find_all().count() == 0 and await File.find_all().count() == 0  # current and historical files
    notes = await Notification.find(Notification.type == "requirement_deleted").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.vic.user.id, team.cleo.user.id}  # heads and the author; the admin did it
    assert (await client.delete(one, headers=team.admin.headers)).status_code == 404
    assert (await client.get(one, headers=team.admin.headers)).status_code == 404


async def test_deleting_a_project_removes_its_requirements_and_files(client, team):
    await put_client_on_project(team)
    f = await upload(client, team.cleo, "spec.pdf", b"%PDF")
    await made(client, team.cleo, team, attachment_ids=[f["id"]])
    assert (await client.delete(f"/projects/{team.project.id}", headers=team.admin.headers)).status_code == 204
    assert await Requirement.find_all().count() == 0 and await File.find_all().count() == 0
