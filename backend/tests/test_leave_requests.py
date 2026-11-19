from datetime import timedelta
from types import SimpleNamespace

import pytest_asyncio
from beanie import PydanticObjectId

from app.core.timeutil import today_local
from app.models import Company, LeaveRequest, Notification


def day(offset: int) -> str:
    return (today_local() + timedelta(days=offset)).isoformat()


@pytest_asyncio.fixture
async def team(make_user):
    """Piixel: employee Eva, admins Ada and Abe. Unwork: admin Uma and employee Ulf. Cleo is a client."""
    piixel = await Company(name="Piixel").insert()
    unwork = await Company(name="Unwork").insert()
    return SimpleNamespace(
        piixel=piixel,
        unwork=unwork,
        eva=await make_user("employee", "Eva Employee", company_id=piixel.id),
        ada=await make_user("admin", "Ada Admin", company_id=piixel.id),
        abe=await make_user("admin", "Abe Admin", company_id=piixel.id),
        uma=await make_user("admin", "Uma Unwork", company_id=unwork.id),
        ulf=await make_user("employee", "Ulf Unwork", company_id=unwork.id),
        cleo=await make_user("client", "Cleo Client"),
    )


async def ask(client, team, who=None, **over):
    body = {"type": "leave", "start_date": day(3), "end_date": day(4), "duration": "full", "reason": "Family event", "admin_id": team.ada.id, **over}
    return await client.post("/leave-requests", json=body, headers=(who or team.eva).headers)


async def notes(person):
    return await Notification.find(Notification.user_id == person.user.id).to_list()


# --- Who can do what ----------------------------------------------------------------------------------------
async def test_requires_login(client):
    assert (await client.get("/leave-requests")).status_code == 401
    assert (await client.post("/leave-requests", json={})).status_code == 401


async def test_only_employees_ask_and_only_admins_review(client, team):
    assert (await ask(client, team, team.ada)).status_code == 403  # an admin does not ask
    assert (await ask(client, team, team.cleo)).status_code == 403
    for who in (team.eva, team.cleo):
        assert (await client.get("/leave-requests", headers=who.headers)).status_code == 403
    assert (await client.get("/leave-requests/mine", headers=team.ada.headers)).status_code == 403


async def test_the_send_to_list_is_the_admins_of_my_own_company(client, team):
    r = await client.get("/leave-requests/admins", headers=team.eva.headers)
    assert [a["name"] for a in r.json()] == ["Abe Admin", "Ada Admin"]  # not Uma, who is on Unwork
    r = await client.get("/leave-requests/admins", headers=team.ulf.headers)
    assert [a["name"] for a in r.json()] == ["Uma Unwork"]


# --- Creating --------------------------------------------------------------------------------------------------
async def test_creating_saves_it_pending_and_tells_the_chosen_admin_only(client, team):
    r = await ask(client, team)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["status"] == "pending" and out["type"] == "leave" and out["duration"] == "full" and out["reason"] == "Family event"
    assert out["user"]["name"] == "Eva Employee" and out["admin"]["name"] == "Ada Admin"
    assert out["company_name"] == "Piixel" and out["reject_reason"] is None and out["decided_at"] is None and out["decided_by"] is None
    saved = await LeaveRequest.find_all().to_list()
    assert len(saved) == 1 and saved[0].company_id == team.piixel.id
    got = await notes(team.ada)
    assert len(got) == 1 and "Eva Employee" in got[0].title and "leave" in got[0].title and got[0].actor_id == team.eva.user.id
    assert await notes(team.abe) == [] and await notes(team.uma) == []


async def test_work_from_home_and_half_days(client, team):
    r = await ask(client, team, type="wfh", start_date=day(5), end_date=day(5), duration="first_half")
    assert r.status_code == 201 and r.json()["type"] == "wfh" and r.json()["duration"] == "first_half"
    assert "work from home" in (await notes(team.ada))[0].title


async def test_dates_are_validated(client, team):
    assert (await ask(client, team, start_date=day(5), end_date=day(4))).status_code == 422  # ends before it starts
    assert (await ask(client, team, start_date=day(-1), end_date=day(1))).status_code == 422  # in the past
    assert (await ask(client, team, start_date="not-a-date", end_date=day(1))).status_code == 422
    assert (await ask(client, team, start_date=day(3), end_date=day(4), duration="first_half")).status_code == 422  # a half day is one day
    assert (await ask(client, team, duration="quarter")).status_code == 422
    assert (await ask(client, team, type="holiday")).status_code == 422
    assert (await ask(client, team, reason="   ")).status_code == 422
    assert (await ask(client, team, start_date=day(0), end_date=day(0))).status_code == 201  # today is fine
    assert await LeaveRequest.find_all().count() == 1


async def test_it_must_go_to_an_admin_of_my_company(client, team):
    assert (await ask(client, team, admin_id=team.uma.id)).status_code == 422  # an admin of another company
    assert (await ask(client, team, admin_id=team.eva.id)).status_code == 422  # not an admin
    assert (await ask(client, team, admin_id=team.abe.id)).status_code == 201


async def test_someone_without_a_company_cannot_ask(client, team, make_user):
    loner = await make_user("employee", "Lena Loner")
    assert (await ask(client, team, loner)).status_code == 422


async def test_overlapping_pending_or_approved_requests_are_refused(client, team):
    first = (await ask(client, team, start_date=day(3), end_date=day(5))).json()
    assert (await ask(client, team, start_date=day(5), end_date=day(6))).status_code == 409  # touches the last day
    assert (await ask(client, team, start_date=day(4), end_date=day(4))).status_code == 409  # inside
    assert (await ask(client, team, start_date=day(1), end_date=day(3), type="wfh")).status_code == 409  # a different type still overlaps
    assert (await ask(client, team, start_date=day(6), end_date=day(7))).status_code == 201  # next to it is fine
    # approved still blocks; rejected does not
    await client.post(f"/leave-requests/{first['id']}/approve", headers=team.ada.headers)
    assert (await ask(client, team, start_date=day(4), end_date=day(4))).status_code == 409
    other = (await ask(client, team, start_date=day(10), end_date=day(10))).json()
    await client.post(f"/leave-requests/{other['id']}/reject", json={"reason": "Busy week"}, headers=team.ada.headers)
    assert (await ask(client, team, start_date=day(10), end_date=day(10))).status_code == 201
    # someone else's requests never get in the way
    assert (await ask(client, team, team.ulf, admin_id=team.uma.id, start_date=day(3), end_date=day(5))).status_code == 201


async def test_the_two_halves_of_a_day_can_both_be_asked_for(client, team):
    assert (await ask(client, team, start_date=day(3), end_date=day(3), duration="first_half")).status_code == 201
    assert (await ask(client, team, start_date=day(3), end_date=day(3), duration="second_half")).status_code == 201
    assert (await ask(client, team, start_date=day(3), end_date=day(3), duration="first_half")).status_code == 409
    assert (await ask(client, team, start_date=day(3), end_date=day(3), duration="full")).status_code == 409


# --- My requests and cancelling ---------------------------------------------------------------------------------
async def test_i_see_only_my_own_requests_newest_first_and_can_filter(client, team):
    a = (await ask(client, team, start_date=day(3), end_date=day(3))).json()
    b = (await ask(client, team, start_date=day(8), end_date=day(8))).json()
    await ask(client, team, team.ulf, admin_id=team.uma.id)
    await client.post(f"/leave-requests/{a['id']}/approve", headers=team.ada.headers)
    mine = (await client.get("/leave-requests/mine", headers=team.eva.headers)).json()
    assert [r["id"] for r in mine] == [b["id"], a["id"]]
    assert [r["id"] for r in (await client.get("/leave-requests/mine?status=approved", headers=team.eva.headers)).json()] == [a["id"]]
    assert (await client.get("/leave-requests/mine?status=maybe", headers=team.eva.headers)).status_code == 422


async def test_cancelling_works_only_for_my_own_request_and_keeps_it_on_record(client, team):
    a = (await ask(client, team, start_date=day(3), end_date=day(3))).json()

    def cancel(r, who):
        return client.post(f"/leave-requests/{r['id']}/cancel", headers=who.headers)

    assert (await cancel(a, team.ulf)).status_code == 404  # someone else's
    assert (await cancel(a, team.ada)).status_code == 403  # an admin is not the employee
    done = await cancel(a, team.eva)
    assert done.status_code == 200 and done.json()["status"] == "cancelled" and done.json()["cancelled_at"]
    assert (await cancel(a, team.eva)).status_code == 409  # already cancelled
    assert await LeaveRequest.find_all().count() == 1  # soft: it stays, with its new status
    assert (await ask(client, team, start_date=day(3), end_date=day(3))).status_code == 201  # the dates are free again


async def test_an_approved_request_can_be_cancelled_before_it_starts_and_the_approver_is_told(client, team):
    from app.core.timeutil import today_local

    b = (await ask(client, team, start_date=day(8), end_date=day(8))).json()
    await client.post(f"/leave-requests/{b['id']}/approve", headers=team.ada.headers)
    await Notification.find_all().delete()
    done = await client.post(f"/leave-requests/{b['id']}/cancel", headers=team.eva.headers)
    assert done.status_code == 200 and done.json()["status"] == "cancelled"
    told = await Notification.find(Notification.type == "leave_cancelled").to_list()
    assert [n.user_id for n in told] == [team.ada.user.id]  # the admin who approved it

    c = (await ask(client, team, start_date=day(10), end_date=day(10))).json()
    await client.post(f"/leave-requests/{c['id']}/approve", headers=team.ada.headers)
    await LeaveRequest.find({"_id": PydanticObjectId(c["id"])}).update({"$set": {"start_date": today_local().isoformat()}})  # it starts today
    late = await client.post(f"/leave-requests/{c['id']}/cancel", headers=team.eva.headers)
    assert late.status_code == 409 and "before its start date" in late.json()["detail"]

    d = (await ask(client, team, start_date=day(12), end_date=day(12))).json()
    await client.post(f"/leave-requests/{d['id']}/reject", json={"reason": "busy"}, headers=team.ada.headers)
    assert (await client.post(f"/leave-requests/{d['id']}/cancel", headers=team.eva.headers)).status_code == 409  # rejected: nothing to cancel


# --- The admin's side ---------------------------------------------------------------------------------------------
async def test_an_admin_sees_only_requests_sent_to_them_and_can_filter(client, team):
    to_ada = (await ask(client, team, start_date=day(3), end_date=day(3))).json()
    to_abe = (await ask(client, team, start_date=day(8), end_date=day(8), admin_id=team.abe.id)).json()
    to_uma = (await ask(client, team, team.ulf, admin_id=team.uma.id)).json()
    assert [r["id"] for r in (await client.get("/leave-requests", headers=team.ada.headers)).json()] == [to_ada["id"]]
    assert [r["id"] for r in (await client.get("/leave-requests", headers=team.abe.headers)).json()] == [to_abe["id"]]
    await client.post(f"/leave-requests/{to_ada['id']}/approve", headers=team.ada.headers)
    assert (await client.get("/leave-requests?status=pending", headers=team.ada.headers)).json() == []
    assert len((await client.get("/leave-requests?status=approved", headers=team.ada.headers)).json()) == 1
    assert len((await client.get(f"/leave-requests?company_id={team.piixel.id}", headers=team.ada.headers)).json()) == 1
    assert (await client.get(f"/leave-requests?company_id={team.unwork.id}", headers=team.ada.headers)).json() == []
    assert [r["id"] for r in (await client.get("/leave-requests", headers=team.uma.headers)).json()] == [to_uma["id"]]


async def test_approving_tells_the_employee_and_records_who_decided(client, team):
    req = (await ask(client, team)).json()
    r = await client.post(f"/leave-requests/{req['id']}/approve", headers=team.ada.headers)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "approved" and out["decided_at"] and out["decided_by"]["name"] == "Ada Admin" and out["reject_reason"] is None
    got = await notes(team.eva)
    assert len(got) == 1 and "approved" in got[0].title and got[0].actor_id == team.ada.user.id
    # it cannot be decided twice
    assert (await client.post(f"/leave-requests/{req['id']}/approve", headers=team.ada.headers)).status_code == 409
    assert (await client.post(f"/leave-requests/{req['id']}/reject", json={"reason": "x"}, headers=team.ada.headers)).status_code == 409
    assert len(await notes(team.eva)) == 1


async def test_rejecting_needs_a_reason_and_sends_it_to_the_employee(client, team):
    req = (await ask(client, team)).json()
    url = f"/leave-requests/{req['id']}/reject"
    assert (await client.post(url, json={}, headers=team.ada.headers)).status_code == 422
    assert (await client.post(url, json={"reason": ""}, headers=team.ada.headers)).status_code == 422
    assert (await client.post(url, json={"reason": "   "}, headers=team.ada.headers)).status_code == 422
    assert (await LeaveRequest.get(req["id"])).status == "pending"
    r = await client.post(url, json={"reason": "Release week, please move it"}, headers=team.ada.headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected" and r.json()["reject_reason"] == "Release week, please move it"
    got = await notes(team.eva)
    assert len(got) == 1 and "rejected" in got[0].title and "Release week, please move it" in got[0].body


async def test_only_the_admin_it_was_sent_to_can_decide_it(client, team):
    req = (await ask(client, team)).json()
    for who in (team.abe, team.uma):  # another admin of the company, an admin of another company
        assert (await client.post(f"/leave-requests/{req['id']}/approve", headers=who.headers)).status_code == 403
        assert (await client.post(f"/leave-requests/{req['id']}/reject", json={"reason": "no"}, headers=who.headers)).status_code == 403
    for who in (team.eva, team.cleo):
        assert (await client.post(f"/leave-requests/{req['id']}/approve", headers=who.headers)).status_code == 403
    assert (await LeaveRequest.get(req["id"])).status == "pending"
    assert (await client.post("/leave-requests/000000000000000000000000/approve", headers=team.ada.headers)).status_code == 404


# --- Live updates for the admin ---------------------------------------------------------------------------------
async def test_the_addressed_admin_is_told_live_when_a_request_is_made_cancelled_or_decided(client, team, monkeypatch):
    from app.services.ws_manager import manager

    sent = []

    async def record(user_ids, event, data):
        sent.append((set(user_ids), event, data.get("state")))

    monkeypatch.setattr(manager, "send_to_users", record)
    a = (await ask(client, team, start_date=day(3), end_date=day(3))).json()
    b = (await ask(client, team, start_date=day(8), end_date=day(8))).json()
    await client.post(f"/leave-requests/{a['id']}/cancel", headers=team.eva.headers)
    await client.post(f"/leave-requests/{b['id']}/approve", headers=team.ada.headers)
    mine = [(who, event, state) for who, event, state in sent if event == "leave_requests"]
    assert mine == [({team.ada.user.id}, "leave_requests", s) for s in ("created", "created", "cancelled", "approved")]


# --- Deleting ---------------------------------------------------------------------------------------------------
async def test_an_employee_deletes_their_own_pending_rejected_or_cancelled_request_but_not_an_approved_one(client, team):
    def remove(r, who):
        return client.delete(f"/leave-requests/{r['id']}", headers=who.headers)

    pending = (await ask(client, team, start_date=day(3), end_date=day(3))).json()
    rejected = (await ask(client, team, start_date=day(8), end_date=day(8))).json()
    cancelled = (await ask(client, team, start_date=day(12), end_date=day(12))).json()
    approved = (await ask(client, team, start_date=day(16), end_date=day(16))).json()
    await client.post(f"/leave-requests/{rejected['id']}/reject", json={"reason": "busy"}, headers=team.ada.headers)
    await client.post(f"/leave-requests/{cancelled['id']}/cancel", headers=team.eva.headers)
    await client.post(f"/leave-requests/{approved['id']}/approve", headers=team.ada.headers)

    assert (await remove(pending, team.ulf)).status_code == 404  # someone else's
    assert (await remove(pending, team.ada)).status_code == 403  # an admin is not the employee
    assert (await remove(pending, team.eva)).status_code == 204
    assert (await remove(rejected, team.eva)).status_code == 204
    assert (await remove(cancelled, team.eva)).status_code == 204
    refused = await remove(approved, team.eva)  # approved: cancel it first
    assert refused.status_code == 409 and "Cancel an approved request first" in refused.json()["detail"]
    assert (await remove(pending, team.eva)).status_code == 404  # already gone

    # soft delete: still in the database, gone from every list
    assert await LeaveRequest.find_all().count() == 4
    assert [r["id"] for r in (await client.get("/leave-requests/mine", headers=team.eva.headers)).json()] == [approved["id"]]
    assert (await client.get("/leave-requests", headers=team.ada.headers)).json()[0]["id"] == approved["id"]
    assert len((await client.get("/leave-requests", headers=team.ada.headers)).json()) == 1
    assert (await client.post(f"/leave-requests/{pending['id']}/approve", headers=team.ada.headers)).status_code == 404

    # the dates of a deleted pending request are free again
    assert (await ask(client, team, start_date=day(3), end_date=day(3))).status_code == 201

    # approved -> cancel (before it starts) -> then it can be deleted
    assert (await client.post(f"/leave-requests/{approved['id']}/cancel", headers=team.eva.headers)).status_code == 200
    assert (await remove(approved, team.eva)).status_code == 204


async def test_deleting_tells_the_admin_live(client, team, monkeypatch):
    from app.services.ws_manager import manager

    sent = []

    async def record(user_ids, event, data):
        sent.append((set(user_ids), event, data.get("state")))

    monkeypatch.setattr(manager, "send_to_users", record)
    a = (await ask(client, team, start_date=day(3), end_date=day(3))).json()
    sent.clear()
    await client.delete(f"/leave-requests/{a['id']}", headers=team.eva.headers)
    assert sent == [({team.ada.user.id}, "leave_requests", "deleted")]


# --- Emails: the three leave emails (in-app notifications are covered above and unchanged) -----------------------------
import pytest  # noqa: E402

from app.services import email as mail  # noqa: E402


@pytest.fixture
def sent(monkeypatch):
    box: list[tuple[str, str, dict]] = []

    async def fake(to, type, subject, **kw):
        box.append((to, type, {"subject": subject, **kw}))

    monkeypatch.setattr(mail, "send_email", fake)
    return box


async def test_a_new_request_emails_only_the_chosen_admin(client, team, sent):
    r = await ask(client, team, type="wfh", start_date=day(3), end_date=day(3), duration="first_half", reason="Plumber visit")
    assert r.status_code == 201
    assert [(to, kind) for to, kind, _ in sent] == [(team.ada.user.email, "leave_requested")]  # not Abe, not the employee
    kw = sent[0][2]
    assert kw["button_label"] == "Review request" and kw["path"] == "/admin/leave-requests"
    assert "Eva Employee" in kw["text"] and "work from home" in kw["text"] and "Plumber visit" in kw["text"] and "(first half)" in kw["text"]


async def test_a_refused_request_sends_no_email(client, team, sent):
    assert (await ask(client, team, admin_id=team.uma.id)).status_code == 422  # not an admin of Eva's company
    assert sent == []


async def test_approving_and_rejecting_email_the_employee_with_the_details(client, team, sent):
    a = (await ask(client, team)).json()
    b = (await ask(client, team, start_date=day(8), end_date=day(8), reason="Trip")).json()
    sent.clear()
    await client.post(f"/leave-requests/{a['id']}/approve", headers=team.ada.headers)
    await client.post(f"/leave-requests/{b['id']}/reject", json={"reason": "Release week"}, headers=team.ada.headers)
    assert [(to, kind) for to, kind, _ in sent] == [(team.eva.user.email, "leave_decision")] * 2
    approved, rejected = sent[0][2], sent[1][2]
    assert "Status: Approved" in approved["text"] and "Type: Leave" in approved["text"] and "Reason" not in approved["text"]
    assert "approved" in approved["heading"] and approved["path"] == "/app/leave-requests" and approved["button_label"] == "View my requests"
    assert "Status: Rejected" in rejected["text"] and "Reason: Release week" in rejected["text"]
    assert (await client.post(f"/leave-requests/{a['id']}/approve", headers=team.ada.headers)).status_code == 409
    assert len(sent) == 2  # a refused second decision sends nothing


async def test_cancelling_an_approved_request_emails_that_admin_only(client, team, sent):
    pending = (await ask(client, team, start_date=day(5), end_date=day(5))).json()
    approved = (await ask(client, team, start_date=day(8), end_date=day(8))).json()
    await client.post(f"/leave-requests/{approved['id']}/approve", headers=team.ada.headers)
    sent.clear()
    await client.post(f"/leave-requests/{pending['id']}/cancel", headers=team.eva.headers)
    assert sent == []  # cancelling a pending one is not emailed
    await client.post(f"/leave-requests/{approved['id']}/cancel", headers=team.eva.headers)
    assert [(to, kind) for to, kind, _ in sent] == [(team.ada.user.email, "leave_cancelled")]
    assert sent[0][2]["path"] == "/admin/leave-requests"


async def test_an_email_problem_never_breaks_the_request(client, team, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("mail is down")

    monkeypatch.setattr(mail, "send_email", boom)
    assert (await ask(client, team)).status_code == 201
