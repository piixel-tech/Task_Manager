from datetime import timedelta

from app.models import File, Notification, Subfolder, Task, TaskReview, TimeLog
from app.services.reminders import run_reminders
from app.core.timeutil import today_local
from tests.test_tasks import backdate_running, day, make_task, team, upload  # noqa: F401  (team is a fixture)


async def submit(client, who, task, approver, note="All done, see files.", **extra):
    return await client.post(
        f"/tasks/{task['id']}/submit", json={"note": note, "approver_id": approver.id, **extra}, headers=who.headers
    )


async def submitted(client, team, approver=None, **extra):
    """A task assigned to Mia and submitted to Hana. Returns (task, review)."""
    t = await make_task(client, team, **extra)
    r = await submit(client, team.mia, t, approver or team.hana)
    assert r.status_code == 201, r.text
    return t, r.json()


async def get_task(client, who, task):
    return (await client.get(f"/tasks/{task['id']}", headers=who.headers)).json()


# --- Approver dropdown ------------------------------------------------------------------------------------------------
async def test_approvers_are_the_heads_of_that_subfolder_only(client, team):
    t = await make_task(client, team)
    got = (await client.get(f"/tasks/{t['id']}/approvers", headers=team.mia.headers)).json()
    assert [p["id"] for p in got] == [team.hana.id]  # not Vic (head of Video), not other members

    await Subfolder.find_all().update({"$addToSet": {"head_ids": team.mia.user.id}})  # Mia becomes a head too
    got = (await client.get(f"/tasks/{t['id']}/approvers", headers=team.mia.headers)).json()
    assert [p["id"] for p in got] == [team.hana.id]  # an assignee never approves their own work

    assert (await client.get(f"/tasks/{t['id']}/approvers", headers=team.ollie.headers)).status_code == 403
    assert (await client.get(f"/tasks/{t['id']}/approvers", headers=team.cleo.headers)).status_code == 403


# --- Submitting -------------------------------------------------------------------------------------------------------
async def test_submit_creates_round_one_and_moves_the_task(client, team):
    t = await make_task(client, team)
    await client.post(f"/tasks/{t['id']}/timer/start", headers=team.mia.headers)
    await backdate_running(60)
    f = await upload(client, team.mia, "work.txt", b"final")

    r = await submit(client, team.mia, t, team.hana, note="  Finished the copy.  ", file_ids=[f["id"]])
    assert r.status_code == 201, r.text
    rv = r.json()
    assert rv["round"] == 1 and rv["decision"] == "pending" and rv["note"] == "Finished the copy."
    assert rv["submitted_by"]["id"] == team.mia.id and rv["approver"]["id"] == team.hana.id
    assert [x["name"] for x in rv["files"]] == ["work.txt"]
    assert rv["can_decide"] is False  # the submitter doesn't decide

    got = await get_task(client, team.mia, t)
    assert got["status"] == "submitted" and got["can_work"] is False
    assert got["timer_running"] is False and got["total_seconds"] >= 60  # the timer stopped on submit
    assert got["pending_review_id"] == rv["id"] and got["review_rounds"] == 1 and got["can_review"] is False
    assert (await get_task(client, team.hana, t))["can_review"] is True


async def test_submit_validation(client, team):
    t = await make_task(client, team)
    for body in ({"approver_id": team.hana.id}, {"note": "  ", "approver_id": team.hana.id}, {"note": "x"}):
        assert (await client.post(f"/tasks/{t['id']}/submit", json=body, headers=team.mia.headers)).status_code == 422
    assert (await submit(client, team.mia, t, team.vic)).status_code == 422  # head of a different subfolder
    assert (await submit(client, team.mia, t, team.max)).status_code == 422  # a member, not a head
    assert (await submit(client, team.mia, t, team.mia)).status_code == 422
    other = await upload(client, team.hana, "theirs.txt")
    assert (await submit(client, team.mia, t, team.hana, file_ids=[other["id"]])).status_code == 422  # not Mia's file
    assert (await submit(client, team.mia, t, team.hana, file_ids=["nope"])).status_code == 422
    assert await TaskReview.find_all().count() == 0
    assert (await get_task(client, team.mia, t))["status"] == "todo"  # failed submits change nothing


async def test_only_the_assignee_can_submit_and_only_once_while_pending(client, team):
    t = await make_task(client, team)
    for who in (team.hana, team.max, team.admin, team.ollie, team.cleo):
        assert (await submit(client, who, t, team.hana)).status_code == 403, who
    assert (await client.post(f"/tasks/{t['id']}/submit", json={"note": "x", "approver_id": team.hana.id})).status_code == 401

    assert (await submit(client, team.mia, t, team.hana)).status_code == 201
    assert (await submit(client, team.mia, t, team.hana)).status_code == 409  # already submitted
    assert await TaskReview.find_all().count() == 1


async def test_files_are_optional(client, team):
    t = await make_task(client, team)
    r = await submit(client, team.mia, t, team.hana)
    assert r.status_code == 201 and r.json()["files"] == []


async def test_approver_gets_a_live_notification_pointing_at_the_inbox(client, team):
    t = await make_task(client, team)
    await Notification.find_all().delete()
    await submit(client, team.mia, t, team.hana)
    notes = await Notification.find(Notification.type == "review_requested").to_list()
    assert [n.user_id for n in notes] == [team.hana.user.id]
    assert notes[0].link == "/app/reviews" and "Mia Member" in notes[0].body and notes[0].actor_id == team.mia.user.id

    t2 = await make_task(client, team, assignee=team.max)
    await Notification.find_all().delete()
    await submit(client, team.max, t2, team.hana)
    assert (await Notification.find_one(Notification.type == "review_requested")).link == "/app/reviews"


# --- Inbox ---------------------------------------------------------------------------------------------------------------
async def test_inbox_shows_a_heads_own_pending_reviews_and_admin_sees_all(client, team):
    a = await make_task(client, team, title="A")
    v = await client.post("/tasks", json={
        "subfolder_id": str(team.video.id), "title": "V", "description": "d", "assignee_id": team.vic.id
    }, headers=team.admin.headers)
    await submit(client, team.mia, a, team.hana)
    assert (await submit(client, team.vic, v.json(), team.hana)).status_code == 422  # Hana isn't Video's head

    mine = (await client.get("/reviews", headers=team.hana.headers)).json()
    assert [r["task_title"] for r in mine] == ["A"] and mine[0]["can_decide"] is True
    assert mine[0]["project_name"] == "Acme" and mine[0]["subfolder_name"] == "Design"

    assert (await client.get("/reviews", headers=team.vic.headers)).json() == []  # not Vic's
    assert (await client.get("/reviews", headers=team.mia.headers)).json() == []  # submitters use the task page
    assert (await client.get("/reviews", headers=team.cleo.headers)).status_code == 403
    assert (await client.get("/reviews")).status_code == 401

    admin_view = (await client.get("/reviews", headers=team.admin.headers)).json()
    assert [r["task_title"] for r in admin_view] == ["A"] and admin_view[0]["can_decide"] is True


async def test_admin_sees_reviews_for_every_subfolder_and_filters_by_decision(client, team):
    a = await make_task(client, team, title="A")
    v = (await client.post("/tasks", json={
        "subfolder_id": str(team.video.id), "title": "V", "description": "d", "assignee_id": team.vic.id
    }, headers=team.admin.headers)).json()
    ra = (await submit(client, team.mia, a, team.hana)).json()
    # Vic is the only head of Video and the assignee, so nobody but an admin could review: no eligible approver
    assert (await submit(client, team.vic, v, team.vic)).status_code == 422
    await client.post(f"/reviews/{ra['id']}/approve", headers=team.hana.headers)

    allr = (await client.get("/reviews", headers=team.admin.headers)).json()
    assert len(allr) == 1 and allr[0]["decision"] == "approved"
    assert (await client.get("/reviews?decision=pending", headers=team.admin.headers)).json() == []
    assert len((await client.get("/reviews?decision=approved", headers=team.hana.headers)).json()) == 1
    assert (await client.get("/reviews?decision=bogus", headers=team.hana.headers)).status_code == 422


async def test_pending_count(client, team):
    assert (await client.get("/reviews/pending-count", headers=team.hana.headers)).json() == {"count": 0}
    await submitted(client, team)
    assert (await client.get("/reviews/pending-count", headers=team.hana.headers)).json() == {"count": 1}
    assert (await client.get("/reviews/pending-count", headers=team.admin.headers)).json() == {"count": 1}
    assert (await client.get("/reviews/pending-count", headers=team.vic.headers)).json() == {"count": 0}
    assert (await client.get("/reviews/pending-count", headers=team.cleo.headers)).json() == {"count": 0}


# --- Approving -----------------------------------------------------------------------------------------------------------
async def test_approve_sets_progress_100_status_approved_and_tells_the_employee(client, team):
    t, rv = await submitted(client, team)
    await client.patch(f"/tasks/{t['id']}", json={"title": "x"}, headers=team.hana.headers)  # editing while pending is fine
    await Notification.find_all().delete()

    r = await client.post(f"/reviews/{rv['id']}/approve", json={"comments": "Lovely."}, headers=team.hana.headers)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["decision"] == "approved" and out["comments"] == "Lovely."
    assert out["decided_by"]["id"] == team.hana.id and out["decided_at"] and out["can_decide"] is False

    got = await get_task(client, team.mia, t)
    assert got["status"] == "approved" and got["progress"] == 100
    assert got["pending_review_id"] is None and got["can_review"] is False and got["can_edit"] is False

    notes = await Notification.find(Notification.type == "review_approved").to_list()
    assert [n.user_id for n in notes] == [team.mia.user.id] and notes[0].link == f"/app/tasks/{t['id']}"
    assert "Lovely." in notes[0].body
    assert (await client.post(f"/reviews/{rv['id']}/approve", headers=team.hana.headers)).status_code == 409  # already decided


async def test_approve_works_without_a_body(client, team):
    _, rv = await submitted(client, team)
    r = await client.post(f"/reviews/{rv['id']}/approve", headers=team.hana.headers)
    assert r.status_code == 200 and r.json()["comments"] is None


async def test_only_the_picked_approver_or_an_admin_can_decide(client, team):
    await Subfolder.find_all().update({"$addToSet": {"head_ids": team.max.user.id}})  # a second head, not picked
    t, rv = await submitted(client, team)
    for who in (team.max, team.mia, team.vic, team.ollie, team.cleo):
        assert (await client.post(f"/reviews/{rv['id']}/approve", headers=who.headers)).status_code == 403, who
        r = await client.post(f"/reviews/{rv['id']}/request-changes", json={"comments": "no"}, headers=who.headers)
        assert r.status_code == 403, who
    assert (await client.post(f"/reviews/{rv['id']}/approve")).status_code == 401
    assert (await get_task(client, team.mia, t))["status"] == "submitted"  # nothing slipped through

    assert (await client.post(f"/reviews/{rv['id']}/approve", headers=team.admin.headers)).status_code == 200
    review = await TaskReview.find_one()
    assert review.decided_by == team.admin.user.id and review.approver_id == team.hana.user.id


async def test_a_head_who_lost_headship_can_no_longer_decide(client, team):
    _, rv = await submitted(client, team)
    await Subfolder.find_all().update({"$pull": {"head_ids": team.hana.user.id}})
    assert (await client.post(f"/reviews/{rv['id']}/approve", headers=team.hana.headers)).status_code == 403
    assert (await client.post(f"/reviews/{rv['id']}/approve", headers=team.admin.headers)).status_code == 200  # admin unblocks


async def test_unknown_review_is_404(client, team):
    assert (await client.post(f"/reviews/{team.design.id}/approve", headers=team.admin.headers)).status_code == 404


# --- Requesting changes + resubmitting ---------------------------------------------------------------------------------
async def test_request_changes_needs_comments_and_notifies(client, team):
    t, rv = await submitted(client, team)
    for body in ({}, {"comments": ""}, {"comments": "   "}):
        r = await client.post(f"/reviews/{rv['id']}/request-changes", json=body, headers=team.hana.headers)
        assert r.status_code == 422, body
    assert (await get_task(client, team.mia, t))["status"] == "submitted"
    await Notification.find_all().delete()

    r = await client.post(f"/reviews/{rv['id']}/request-changes", json={"comments": "Tighten the intro."}, headers=team.hana.headers)
    assert r.status_code == 200, r.text
    assert r.json()["decision"] == "changes_requested" and r.json()["comments"] == "Tighten the intro."

    got = await get_task(client, team.mia, t)
    assert got["status"] == "changes_requested" and got["progress"] != 100
    assert got["can_work"] is True and got["pending_review_id"] is None  # back with the employee

    notes = await Notification.find(Notification.type == "review_changes_requested").to_list()
    assert [n.user_id for n in notes] == [team.mia.user.id] and "Tighten the intro." in notes[0].body
    assert (await client.post(f"/reviews/{rv['id']}/request-changes", json={"comments": "again"}, headers=team.hana.headers)).status_code == 409


async def test_every_round_is_listed_with_who_and_when_and_the_employee_can_resubmit(client, team):
    t, r1 = await submitted(client, team)
    await client.post(f"/reviews/{r1['id']}/request-changes", json={"comments": "Fix the headline."}, headers=team.hana.headers)

    f = await upload(client, team.mia, "v2.txt", b"better")
    r2 = await submit(client, team.mia, t, team.hana, note="Headline fixed.", file_ids=[f["id"]])
    assert r2.status_code == 201 and r2.json()["round"] == 2
    await client.post(f"/reviews/{r2.json()['id']}/request-changes", json={"comments": "Footer too."}, headers=team.hana.headers)

    r3 = await submit(client, team.mia, t, team.hana, note="Footer fixed.")
    assert r3.json()["round"] == 3
    await client.post(f"/reviews/{r3.json()['id']}/approve", headers=team.hana.headers)

    rounds = (await client.get(f"/tasks/{t['id']}/reviews", headers=team.mia.headers)).json()
    assert [(x["round"], x["decision"]) for x in rounds] == [(1, "changes_requested"), (2, "changes_requested"), (3, "approved")]
    assert [x["comments"] for x in rounds] == ["Fix the headline.", "Footer too.", None]
    assert all(x["decided_by"]["id"] == team.hana.id and x["decided_at"] for x in rounds)
    assert rounds[1]["files"][0]["name"] == "v2.txt" and rounds[1]["note"] == "Headline fixed."
    assert (await get_task(client, team.mia, t))["review_rounds"] == 3

    # the same history is visible to the head and admin, not to outsiders or clients
    for who, code in ((team.hana, 200), (team.admin, 200), (team.max, 200), (team.ollie, 403), (team.cleo, 403)):
        assert (await client.get(f"/tasks/{t['id']}/reviews", headers=who.headers)).status_code == code, who
    assert (await client.post(f"/tasks/{t['id']}/submit", json={"note": "x", "approver_id": team.hana.id}, headers=team.mia.headers)).status_code == 409


async def test_resubmitting_notifies_the_approver_again(client, team):
    t, r1 = await submitted(client, team)
    await client.post(f"/reviews/{r1['id']}/request-changes", json={"comments": "More."}, headers=team.hana.headers)
    await Notification.find_all().delete()
    await submit(client, team.mia, t, team.hana)
    note = await Notification.find_one(Notification.type == "review_requested")
    assert note.user_id == team.hana.user.id and "resubmitted" in note.body


async def test_a_resubmission_can_go_to_a_different_head(client, team):
    await Subfolder.find_all().update({"$addToSet": {"head_ids": team.max.user.id}})
    t, r1 = await submitted(client, team)
    await client.post(f"/reviews/{r1['id']}/request-changes", json={"comments": "Redo."}, headers=team.hana.headers)
    r2 = (await submit(client, team.mia, t, team.max)).json()
    assert r2["approver"]["id"] == team.max.id
    assert (await client.post(f"/reviews/{r2['id']}/approve", headers=team.hana.headers)).status_code == 403
    assert (await client.post(f"/reviews/{r2['id']}/approve", headers=team.max.headers)).status_code == 200


# --- Guards around a pending review --------------------------------------------------------------------------------------------------------
async def test_cannot_reassign_while_a_review_is_pending(client, team):
    t, _ = await submitted(client, team)
    r = await client.patch(f"/tasks/{t['id']}", json={"assignee_id": team.max.id}, headers=team.hana.headers)
    assert r.status_code == 409


async def test_deleting_a_task_removes_its_reviews_and_their_files(client, team):
    t = await make_task(client, team)
    f = await upload(client, team.mia, "evidence.txt")
    await submit(client, team.mia, t, team.hana, file_ids=[f["id"]])
    assert await File.find_all().count() == 1
    assert (await client.delete(f"/tasks/{t['id']}", headers=team.hana.headers)).status_code == 204
    assert await TaskReview.find_all().count() == 0 and await File.find_all().count() == 0


# --- Reminders -----------------------------------------------------------------------------------------------------------------------------------------
async def test_reminders_stop_when_submitted_and_resume_if_changes_are_requested(client, team):
    t = await make_task(client, team, due_date=day(1))
    assert await run_reminders(today_local()) == 1

    r = (await submit(client, team.mia, t, team.hana)).json()
    assert await run_reminders(today_local() + timedelta(days=1)) == 0  # submitted: stop
    assert await run_reminders(today_local() + timedelta(days=5)) == 0  # even once overdue

    await client.post(f"/reviews/{r['id']}/request-changes", json={"comments": "Redo."}, headers=team.hana.headers)
    assert await run_reminders(today_local() + timedelta(days=6)) == 1  # back with the employee

    r2 = (await submit(client, team.mia, t, team.hana)).json()
    await client.post(f"/reviews/{r2['id']}/approve", headers=team.hana.headers)
    assert await run_reminders(today_local() + timedelta(days=7)) == 0  # approved: done for good


async def test_approving_stops_a_timer_left_running(client, team):
    t = await make_task(client, team)
    r = (await submit(client, team.mia, t, team.hana)).json()
    # a stray timer (e.g. started in another tab just before submitting) must not outlive the review
    task = await Task.find_one()
    await TimeLog(task_id=task.id, user_id=team.mia.user.id, started_at=task.created_at).insert()
    await client.post(f"/reviews/{r['id']}/approve", headers=team.hana.headers)
    assert await TimeLog.find(TimeLog.running == True).count() == 0  # noqa: E712
