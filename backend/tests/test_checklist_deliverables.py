from app.core.timeutil import today_local
from app.models import ChecklistItem, DeliverablePlan, File, Notification, Project, Subfolder
from tests.test_tasks import team, upload  # noqa: F401  (team is a fixture)

MONTH = "2026-11"


def cl(sub):
    return f"/subfolders/{sub.id}/checklist"


async def add(client, who, sub, text="Collect brand assets", **extra):
    return await client.post(cl(sub), json={"text": text, **extra}, headers=who.headers)


# --- Checklist: add / read ---------------------------------------------------------------------------------
async def test_any_member_adds_items_and_the_list_records_who_and_when(client, team):
    for who in (team.hana, team.mia, team.max):  # head and plain members alike
        r = await add(client, who, team.design, f"item by {who.user.name}")
        assert r.status_code == 201, r.text
        assert r.json()["created_by"]["id"] == who.id and "done" not in r.json() and r.json()["can_edit"] is True
    got = (await client.get(cl(team.design), headers=team.max.headers)).json()
    assert [i["text"] for i in got["items"]] == ["item by Hana Head", "item by Mia Member", "item by Max Member"]
    assert got["can_write"] is True and got["can_manage"] is False
    assert (await client.get(cl(team.design), headers=team.hana.headers)).json()["can_manage"] is True


async def test_text_validation(client, team):
    for body in ({}, {"text": ""}, {"text": "   "}, {"text": "x" * 501}):
        assert (await client.post(cl(team.design), json=body, headers=team.mia.headers)).status_code == 422, body


async def test_checklist_access_follows_the_roles_table(client, team):
    await add(client, team.mia, team.design)
    # a member of the sibling subfolder can read but not write; an outsider can't even read
    assert (await client.get(cl(team.design), headers=team.vic.headers)).status_code == 200
    assert (await client.get(cl(team.design), headers=team.vic.headers)).json()["can_write"] is False
    assert (await add(client, team.vic, team.design)).status_code == 403
    assert (await client.get(cl(team.design), headers=team.ollie.headers)).status_code == 403
    assert (await add(client, team.ollie, team.design)).status_code == 403
    assert (await client.get(cl(team.design), headers=team.cleo.headers)).status_code == 403
    assert (await add(client, team.cleo, team.design)).status_code == 403
    assert (await client.get(cl(team.design))).status_code == 401
    assert (await add(client, team.admin, team.design)).status_code == 201  # admin may do anything
    assert (await client.get(f"/subfolders/{team.design.id}x/checklist", headers=team.mia.headers)).status_code == 422


# --- Editing ---------------------------------------------------------------------------------------------------
async def test_only_the_author_edits_an_item_and_there_is_no_tick(client, team):
    item = (await add(client, team.mia, team.design, "Book studio")).json()
    assert item["updated_at"] is None
    r = await client.patch(f"/checklist/{item['id']}", json={"text": "  Book the big studio "}, headers=team.mia.headers)
    assert r.status_code == 200 and r.json()["text"] == "Book the big studio" and r.json()["updated_at"]
    assert r.json()["created_by"]["id"] == team.mia.id and r.json()["can_edit"] is True

    for who in (team.max, team.hana, team.admin):  # other members, even heads and admins, can't reword it
        assert (await client.patch(f"/checklist/{item['id']}", json={"text": "hijack"}, headers=who.headers)).status_code == 403, who
    assert (await client.patch(f"/checklist/{item['id']}", json={"text": "x"}, headers=team.vic.headers)).status_code == 403
    assert (await client.patch(f"/checklist/{item['id']}", json={"text": "x"})).status_code == 401
    for body in ({}, {"text": ""}, {"text": "   "}, {"text": "x" * 501}, {"done": True}):
        assert (await client.patch(f"/checklist/{item['id']}", json=body, headers=team.mia.headers)).status_code == 422, body
    assert (await client.patch(f"/checklist/{team.design.id}", json={"text": "x"}, headers=team.mia.headers)).status_code == 404

    got = (await client.get(cl(team.design), headers=team.max.headers)).json()["items"][0]
    assert got["text"] == "Book the big studio" and got["can_edit"] is False and got["can_delete"] is False
    assert (await client.get(cl(team.design), headers=team.hana.headers)).json()["items"][0]["can_delete"] is True


# --- Attachments -------------------------------------------------------------------------------------------------------
async def test_attach_files_and_links_and_show_who_attached(client, team):
    f = await upload(client, team.mia, "moodboard.txt", b"colours")
    link = (await client.post("/files/link", json={"title": "Brand guide", "url": "https://example.com/b"}, headers=team.max.headers)).json()
    item = (await add(client, team.mia, team.design, attachment_ids=[f["id"]])).json()
    assert [a["name"] for a in item["attachments"]] == ["moodboard.txt"] and item["attachments"][0]["owner"]["id"] == team.mia.id

    r = await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": [link["id"]]}, headers=team.max.headers)
    assert r.status_code == 200
    assert [(a["name"], a["kind"], a["owner"]["id"]) for a in r.json()["attachments"]] == [
        ("moodboard.txt", "upload", team.mia.id),
        ("Brand guide", "link", team.max.id),
    ]
    again = await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": [link["id"]]}, headers=team.max.headers)
    assert len(again.json()["attachments"]) == 2  # no duplicates


async def test_cannot_attach_someone_elses_or_missing_files_or_as_a_non_member(client, team):
    theirs = await upload(client, team.hana, "hers.txt")
    item = (await add(client, team.mia, team.design)).json()
    assert (await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": [theirs["id"]]}, headers=team.mia.headers)).status_code == 422
    assert (await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": [str(team.design.id)]}, headers=team.mia.headers)).status_code == 422
    assert (await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": []}, headers=team.mia.headers)).status_code == 422
    own = await upload(client, team.vic)
    assert (await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": [own["id"]]}, headers=team.vic.headers)).status_code == 403
    assert (await add(client, team.mia, team.design, attachment_ids=[theirs["id"]])).status_code == 422


async def test_remove_attachment_by_its_owner_or_a_head_and_the_file_is_deleted(client, team):
    mine = await upload(client, team.mia, "mine.txt")
    maxs = await upload(client, team.max, "maxs.txt")
    item = (await add(client, team.mia, team.design, attachment_ids=[mine["id"]])).json()
    await client.post(f"/checklist/{item['id']}/attachments", json={"file_ids": [maxs["id"]]}, headers=team.max.headers)

    assert (await client.delete(f"/checklist/{item['id']}/attachments/{maxs['id']}", headers=team.mia.headers)).status_code == 403  # not hers
    r = await client.delete(f"/checklist/{item['id']}/attachments/{mine['id']}", headers=team.mia.headers)
    assert r.status_code == 200 and [a["name"] for a in r.json()["attachments"]] == ["maxs.txt"]
    assert await File.get(mine["id"]) is None
    assert (await client.delete(f"/checklist/{item['id']}/attachments/{maxs['id']}", headers=team.hana.headers)).status_code == 200  # head
    assert await File.find_all().count() == 0
    assert (await client.delete(f"/checklist/{item['id']}/attachments/{maxs['id']}", headers=team.hana.headers)).status_code == 404


# --- Deleting ---------------------------------------------------------------------------------------------------
async def test_delete_by_creator_head_or_admin_only_and_removes_files(client, team):
    f = await upload(client, team.mia)
    a = (await add(client, team.mia, team.design, attachment_ids=[f["id"]])).json()
    b = (await add(client, team.mia, team.design)).json()
    c = (await add(client, team.mia, team.design)).json()
    assert (await client.delete(f"/checklist/{a['id']}", headers=team.max.headers)).status_code == 403  # another member
    assert (await client.delete(f"/checklist/{a['id']}", headers=team.vic.headers)).status_code == 403
    assert (await client.delete(f"/checklist/{a['id']}", headers=team.mia.headers)).status_code == 204
    assert await File.find_all().count() == 0
    assert (await client.delete(f"/checklist/{b['id']}", headers=team.hana.headers)).status_code == 204
    assert (await client.delete(f"/checklist/{c['id']}", headers=team.admin.headers)).status_code == 204
    assert await ChecklistItem.find_all().count() == 0
    assert (await client.delete(f"/checklist/{c['id']}", headers=team.admin.headers)).status_code == 404


async def test_checklist_changes_notify_the_team_but_not_the_actor(client, team):
    await Notification.find_all().delete()
    item = (await add(client, team.mia, team.design, "Book studio")).json()
    notes = await Notification.find(Notification.type == "checklist_updated").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.max.user.id}  # not Mia, not Video's team
    assert all(n.link == f"/app/projects/{team.project.id}/subfolders/{team.design.id}?tab=checklist" for n in notes)
    assert "Book studio" in notes[0].body

    await Notification.find_all().delete()
    await client.patch(f"/checklist/{item['id']}", json={"text": "Book the studio"}, headers=team.mia.headers)
    assert {n.user_id for n in await Notification.find_all().to_list()} == {team.hana.user.id, team.max.user.id}
    await Notification.find_all().delete()
    await client.patch(f"/checklist/{item['id']}", json={"text": "Book the studio"}, headers=team.mia.headers)  # no change: no notice
    assert await Notification.find_all().count() == 0

    await Notification.find_all().delete()
    await client.delete(f"/checklist/{item['id']}", headers=team.admin.headers)
    assert await Notification.find(Notification.type == "checklist_updated").count() == 3  # admin isn't on the team
    assert (await Notification.find_one(Notification.user_id == team.hana.user.id)).link.startswith("/app/")


# --- Deliverables: counts ---------------------------------------------------------------------------------------
def dl(sub, month=MONTH):
    return f"/subfolders/{sub.id}/deliverables/{month}"


async def set_counts(client, who, sub, counts, month=MONTH):
    return await client.put(dl(sub, month), json={"counts": counts}, headers=who.headers)


async def test_head_sets_counts_and_numbered_items_appear(client, team):
    r = await set_counts(client, team.hana, team.design, {"Reels": 12, "Creatives": 8})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["month"] == MONTH and d["total"] == 20 and d["progress"] == 0
    assert d["stages"] == ["writing", "shoot_pending", "shoot", "editing", "waiting_approval", "approved", "posted"]
    assert [(t["type"], t["total"]) for t in d["types"]] == [("Reels", 12), ("Creatives", 8)] or sorted(
        (t["type"], t["total"]) for t in d["types"]
    ) == [("Creatives", 8), ("Reels", 12)]
    reels = [i for i in d["items"] if i["type"] == "Reels"]
    assert [i["number"] for i in reels] == list(range(1, 13)) and reels[2]["title"] == "Reels 3"
    assert all(i["stage"] == "writing" for i in d["items"]) and d["by_stage"]["writing"] == 20
    assert d["can_set_counts"] is True and d["can_set_stage"] is True


async def test_admin_may_set_counts_but_members_and_outsiders_may_not(client, team):
    assert (await set_counts(client, team.admin, team.design, {"Reels": 2})).status_code == 200
    for who in (team.mia, team.max, team.vic, team.ollie, team.cleo):
        assert (await set_counts(client, who, team.design, {"Reels": 5})).status_code == 403, who
    assert (await client.put(dl(team.design), json={"counts": {"Reels": 5}})).status_code == 401
    assert (await set_counts(client, team.hana, team.video, {"Reels": 1})).status_code == 403  # head of a different subfolder


async def test_count_validation(client, team):
    for counts in ({}, {"Reels": -1}, {"Reels": 201}, {"": 3}, {"   ": 3}, {"x" * 41: 1}, {"Reels": 1, "reels": 2}):
        assert (await set_counts(client, team.hana, team.design, counts)).status_code == 422, counts
    assert (await set_counts(client, team.hana, team.design, {"Reels": 1}, month="2026-13")).status_code == 422
    assert (await set_counts(client, team.hana, team.design, {"Reels": 1}, month="nov")).status_code == 422
    assert (await set_counts(client, team.hana, team.design, {f"T{i}": 1 for i in range(21)})).status_code == 422
    assert await DeliverablePlan.find_all().count() == 0 or all(not p.items for p in await DeliverablePlan.find_all().to_list())


async def test_raising_counts_adds_the_next_numbers_and_keeps_existing_progress(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 2})).json()
    first = d["items"][0]
    await client.patch(f"{dl(team.design)}/items/{first['id']}", json={"stage": "editing"}, headers=team.mia.headers)
    d = (await set_counts(client, team.hana, team.design, {"  reels ": 4})).json()  # case/space-insensitive, same type
    assert [i["number"] for i in d["items"]] == [1, 2, 3, 4] and {i["type"] for i in d["items"]} == {"Reels"}
    assert next(i for i in d["items"] if i["id"] == first["id"])["stage"] == "editing"
    assert (await set_counts(client, team.hana, team.design, {"Reels": 4})).json()["total"] == 4  # same count: no-op


async def test_lowering_counts_removes_the_highest_but_never_work_that_moved_on(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 4, "Creatives": 2})).json()
    d = (await set_counts(client, team.hana, team.design, {"Reels": 2})).json()
    assert sorted((t["type"], t["total"]) for t in d["types"]) == [("Creatives", 2), ("Reels", 2)]  # Creatives untouched
    assert [i["number"] for i in d["items"] if i["type"] == "Reels"] == [1, 2]

    two = next(i for i in d["items"] if i["type"] == "Reels" and i["number"] == 2)
    await client.patch(f"{dl(team.design)}/items/{two['id']}", json={"stage": "shoot"}, headers=team.mia.headers)
    r = await set_counts(client, team.hana, team.design, {"Reels": 1})
    assert r.status_code == 409 and "Reels 2" in r.json()["detail"]
    assert (await client.get(f"/subfolders/{team.design.id}/deliverables?month={MONTH}", headers=team.hana.headers)).json()["total"] == 4

    gone = (await set_counts(client, team.hana, team.design, {"Creatives": 0})).json()  # zero removes the type
    assert [t["type"] for t in gone["types"]] == ["Reels"]


async def test_months_are_independent_and_default_is_the_current_month(client, team):
    await set_counts(client, team.hana, team.design, {"Reels": 3}, month="2026-11")
    await set_counts(client, team.hana, team.design, {"Reels": 5}, month="2026-12")
    now = today_local().strftime("%Y-%m")
    nov = (await client.get(f"/subfolders/{team.design.id}/deliverables?month=2026-11", headers=team.mia.headers)).json()
    dec = (await client.get(f"/subfolders/{team.design.id}/deliverables?month=2026-12", headers=team.mia.headers)).json()
    assert (nov["total"], dec["total"]) == (3, 5)
    default = (await client.get(f"/subfolders/{team.design.id}/deliverables", headers=team.mia.headers)).json()
    assert default["month"] == now
    empty = (await client.get(f"/subfolders/{team.design.id}/deliverables?month=2030-01", headers=team.mia.headers)).json()
    assert empty["total"] == 0 and empty["items"] == [] and empty["types"] == [] and empty["progress"] == 0
    assert await DeliverablePlan.find(DeliverablePlan.month == "2030-01").count() == 0  # reading doesn't create plans
    assert (await client.get(f"/subfolders/{team.design.id}/deliverables?month=bad", headers=team.mia.headers)).status_code == 422


# --- Deliverables: stages + tracker -----------------------------------------------------------------------------
async def test_any_member_changes_a_stage_and_the_tracker_counts_it(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 4, "Creatives": 2})).json()
    reels = [i for i in d["items"] if i["type"] == "Reels"]
    moves = [(reels[0], "posted", team.mia), (reels[1], "editing", team.max), (reels[2], "editing", team.hana)]
    for item, stage, who in moves:
        r = await client.patch(f"{dl(team.design)}/items/{item['id']}", json={"stage": stage}, headers=who.headers)
        assert r.status_code == 200, r.text
    d = r.json()
    by = {t["type"]: t for t in d["types"]}
    assert by["Reels"]["by_stage"]["posted"] == 1 and by["Reels"]["by_stage"]["editing"] == 2 and by["Reels"]["by_stage"]["writing"] == 1
    assert by["Creatives"]["by_stage"]["writing"] == 2 and by["Creatives"]["progress"] == 0
    assert by["Reels"]["progress"] == round(100 * (6 + 3 + 3) / (4 * 6))  # average position along the 7 stages
    assert d["by_stage"]["editing"] == 2 and d["total"] == 6 and 0 < d["progress"] < 100
    moved = next(i for i in d["items"] if i["id"] == reels[1]["id"])
    assert moved["stage"] == "editing" and moved["updated_by"]["id"] == team.max.id and moved["updated_at"]


async def test_all_posted_is_100_percent_and_stages_can_move_backwards(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 2})).json()
    for i in d["items"]:
        r = await client.patch(f"{dl(team.design)}/items/{i['id']}", json={"stage": "posted"}, headers=team.mia.headers)
    assert r.json()["progress"] == 100 and r.json()["types"][0]["progress"] == 100
    r = await client.patch(f"{dl(team.design)}/items/{d['items'][0]['id']}", json={"stage": "shoot_pending"}, headers=team.mia.headers)
    assert r.json()["items"][0]["stage"] == "shoot_pending" and r.json()["progress"] < 100


async def test_stage_permissions_and_validation(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 1})).json()
    item = d["items"][0]["id"]
    for who in (team.vic, team.ollie, team.cleo):
        assert (await client.patch(f"{dl(team.design)}/items/{item}", json={"stage": "shoot"}, headers=who.headers)).status_code == 403, who
    assert (await client.patch(f"{dl(team.design)}/items/{item}", json={"stage": "shoot"})).status_code == 401
    assert (await client.patch(f"{dl(team.design)}/items/{item}", json={"stage": "done"}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch(f"{dl(team.design)}/items/{item}", json={}, headers=team.mia.headers)).status_code == 422
    assert (await client.patch(f"{dl(team.design)}/items/nope", json={"stage": "shoot"}, headers=team.mia.headers)).status_code == 404
    assert (await client.patch(f"{dl(team.design, '2030-01')}/items/{item}", json={"stage": "shoot"}, headers=team.mia.headers)).status_code == 404
    assert (await client.patch(f"{dl(team.design)}/items/{item}", json={"stage": "shoot"}, headers=team.admin.headers)).status_code == 200


async def test_viewing_deliverables_follows_the_roles_table(client, team):
    await set_counts(client, team.hana, team.design, {"Reels": 1})
    url = f"/subfolders/{team.design.id}/deliverables?month={MONTH}"
    for who, code in ((team.hana, 200), (team.mia, 200), (team.vic, 200), (team.admin, 200), (team.ollie, 403), (team.cleo, 403)):
        r = await client.get(url, headers=who.headers)
        assert r.status_code == code, who
    assert (await client.get(url, headers=team.vic.headers)).json()["can_set_stage"] is False  # read-only for a sibling's member

    await Project.find_all().update({"$addToSet": {"client_ids": team.cleo.user.id}})  # Cleo joins the project
    r = await client.get(url, headers=team.cleo.headers)
    assert r.status_code == 200 and r.json()["can_set_stage"] is False and r.json()["can_set_counts"] is False
    assert (await client.patch(f"{dl(team.design)}/items/{r.json()['items'][0]['id']}", json={"stage": "shoot"}, headers=team.cleo.headers)).status_code == 403


async def test_deliverable_changes_notify_the_team_but_not_the_actor(client, team):
    await Notification.find_all().delete()
    d = (await set_counts(client, team.hana, team.design, {"Reels": 2})).json()
    notes = await Notification.find(Notification.type == "deliverables_updated").to_list()
    assert {n.user_id for n in notes} == {team.mia.user.id, team.max.user.id}
    assert "Reels: 0 → 2" in notes[0].body and MONTH in notes[0].body
    assert notes[0].link == f"/app/projects/{team.project.id}/subfolders/{team.design.id}?tab=deliverables"

    await Notification.find_all().delete()
    await set_counts(client, team.hana, team.design, {"Reels": 2})  # nothing changed: stay quiet
    assert await Notification.find_all().count() == 0

    await client.patch(f"{dl(team.design)}/items/{d['items'][0]['id']}", json={"stage": "shoot"}, headers=team.mia.headers)
    notes = await Notification.find(Notification.type == "deliverables_updated").to_list()
    assert {n.user_id for n in notes} == {team.hana.user.id, team.max.user.id}
    assert "Reels 1" in notes[0].body and "writing to shoot" in notes[0].body

    await Notification.find_all().delete()
    await client.patch(f"{dl(team.design)}/items/{d['items'][0]['id']}", json={"stage": "shoot"}, headers=team.mia.headers)  # same stage
    assert await Notification.find_all().count() == 0


# --- Deliverables: add more / delete one / remove a type ---------------------------------------------------------
async def test_head_adds_more_items_to_a_type_or_starts_a_new_one(client, team):
    await set_counts(client, team.hana, team.design, {"Reels": 2})
    r = await client.post(f"{dl(team.design)}/items", json={"type": " reels ", "count": 3}, headers=team.hana.headers)
    assert r.status_code == 201, r.text
    assert [i["number"] for i in r.json()["items"]] == [1, 2, 3, 4, 5] and {i["type"] for i in r.json()["items"]} == {"Reels"}
    r = await client.post(f"{dl(team.design)}/items", json={"type": "Stories"}, headers=team.admin.headers)  # count defaults to 1
    assert sorted((t["type"], t["total"]) for t in r.json()["types"]) == [("Reels", 5), ("Stories", 1)]
    # also works on a month with no plan yet
    r = await client.post(f"{dl(team.design, '2027-01')}/items", json={"type": "Reels", "count": 2}, headers=team.hana.headers)
    assert r.json()["total"] == 2

    for who in (team.mia, team.max, team.vic, team.ollie, team.cleo):
        assert (await client.post(f"{dl(team.design)}/items", json={"type": "Reels"}, headers=who.headers)).status_code == 403, who
    assert (await client.post(f"{dl(team.design)}/items", json={"type": "Reels"})).status_code == 401
    assert (await client.post(f"{dl(team.video)}/items", json={"type": "Reels"}, headers=team.hana.headers)).status_code == 403
    for body in ({}, {"type": ""}, {"type": "x" * 41}, {"type": "Reels", "count": 0}, {"type": "Reels", "count": 201}):
        assert (await client.post(f"{dl(team.design)}/items", json=body, headers=team.hana.headers)).status_code == 422, body
    assert (await client.post(f"{dl(team.design)}/items", json={"type": "Reels", "count": 200}, headers=team.hana.headers)).status_code == 422  # 5 + 200 > cap


async def test_deleting_one_item_keeps_the_others_numbers_and_works_at_any_stage(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 3})).json()
    two = d["items"][1]
    await client.patch(f"{dl(team.design)}/items/{two['id']}", json={"stage": "editing"}, headers=team.mia.headers)
    r = await client.delete(f"{dl(team.design)}/items/{two['id']}", headers=team.hana.headers)  # past writing is fine for an explicit delete
    assert r.status_code == 200 and [i["number"] for i in r.json()["items"]] == [1, 3] and r.json()["total"] == 2
    r = await client.post(f"{dl(team.design)}/items", json={"type": "Reels"}, headers=team.hana.headers)
    assert [i["title"] for i in r.json()["items"]] == ["Reels 1", "Reels 3", "Reels 4"]  # no number is reused

    assert (await client.delete(f"{dl(team.design)}/items/{two['id']}", headers=team.hana.headers)).status_code == 404  # already gone
    one = r.json()["items"][0]["id"]
    for who in (team.mia, team.vic, team.ollie, team.cleo):
        assert (await client.delete(f"{dl(team.design)}/items/{one}", headers=who.headers)).status_code == 403, who
    assert (await client.delete(f"{dl(team.design)}/items/{one}")).status_code == 401
    assert (await client.delete(f"{dl(team.design, '2030-01')}/items/{one}", headers=team.hana.headers)).status_code == 404
    assert (await client.delete(f"{dl(team.design)}/items/{one}", headers=team.admin.headers)).status_code == 200


async def test_removing_a_whole_type_leaves_the_other_types(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 3, "Creatives": 2})).json()
    reel = next(i for i in d["items"] if i["type"] == "Reels")
    await client.patch(f"{dl(team.design)}/items/{reel['id']}", json={"stage": "posted"}, headers=team.mia.headers)
    url = f"{dl(team.design)}/types"
    for who in (team.mia, team.vic, team.cleo):
        assert (await client.delete(url, params={"type": "Reels"}, headers=who.headers)).status_code == 403, who
    assert (await client.delete(url, params={"type": "Reels"})).status_code == 401
    assert (await client.delete(url, headers=team.hana.headers)).status_code == 422  # type is required
    assert (await client.delete(url, params={"type": "Nope"}, headers=team.hana.headers)).status_code == 404

    r = await client.delete(url, params={"type": " reels "}, headers=team.hana.headers)  # case/space-insensitive, any stage
    assert r.status_code == 200 and [(t["type"], t["total"]) for t in r.json()["types"]] == [("Creatives", 2)]
    assert r.json()["total"] == 2 and all(i["type"] == "Creatives" for i in r.json()["items"])
    assert (await client.delete(url, params={"type": "Reels"}, headers=team.hana.headers)).status_code == 404


async def test_each_type_reports_done_and_remaining(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 4, "Creatives": 2})).json()
    reels = [i for i in d["items"] if i["type"] == "Reels"]
    for item, stage in ((reels[0], "posted"), (reels[1], "posted"), (reels[2], "approved")):  # approved is not done yet
        r = await client.patch(f"{dl(team.design)}/items/{item['id']}", json={"stage": stage}, headers=team.mia.headers)
    d = r.json()
    by = {t["type"]: t for t in d["types"]}
    assert (by["Reels"]["done"], by["Reels"]["remaining"]) == (2, 2) and (by["Creatives"]["done"], by["Creatives"]["remaining"]) == (0, 2)
    assert (d["done"], d["remaining"], d["total"]) == (2, 4, 6)


async def test_add_and_delete_notify_the_team_but_not_the_actor(client, team):
    d = (await set_counts(client, team.hana, team.design, {"Reels": 2})).json()
    await Notification.find_all().delete()
    await client.post(f"{dl(team.design)}/items", json={"type": "Reels", "count": 2}, headers=team.hana.headers)
    notes = await Notification.find(Notification.type == "deliverables_updated").to_list()
    assert {n.user_id for n in notes} == {team.mia.user.id, team.max.user.id} and "added 2 Reels" in notes[0].body

    await Notification.find_all().delete()
    await client.delete(f"{dl(team.design)}/items/{d['items'][0]['id']}", headers=team.hana.headers)
    notes = await Notification.find(Notification.type == "deliverables_updated").to_list()
    assert {n.user_id for n in notes} == {team.mia.user.id, team.max.user.id} and "deleted Reels 1" in notes[0].body

    await Notification.find_all().delete()
    await client.delete(f"{dl(team.design)}/types", params={"type": "Reels"}, headers=team.hana.headers)
    notes = await Notification.find(Notification.type == "deliverables_updated").to_list()
    assert len(notes) == 2 and "removed Reels (3 items)" in notes[0].body


# --- Cascade ---------------------------------------------------------------------------------------------------
async def test_deleting_a_project_removes_its_checklists_files_and_plans(client, team):
    f = await upload(client, team.mia)
    await add(client, team.mia, team.design, attachment_ids=[f["id"]])
    await set_counts(client, team.hana, team.design, {"Reels": 2})
    assert (await client.delete(f"/projects/{team.project.id}", headers=team.admin.headers)).status_code == 204
    assert await ChecklistItem.find_all().count() == 0 and await DeliverablePlan.find_all().count() == 0
    assert await File.find_all().count() == 0 and await Subfolder.find(Subfolder.id == team.design.id).count() == 0
