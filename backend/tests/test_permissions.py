"""The Roles table from SPEC.md, one assertion per cell."""
from types import SimpleNamespace

import pytest
from beanie import PydanticObjectId
from fastapi import HTTPException

from app.core.permissions import can, is_head, is_member, require


def uid() -> PydanticObjectId:
    return PydanticObjectId()


def person(role: str, active: bool = True):
    """A lightweight stand-in for a User document (no database needed)."""
    return SimpleNamespace(id=uid(), role=role, is_active=active)


class Folder:
    """Stands in for a Subfolder document."""

    def __init__(self, heads=(), members=()):
        self.head_ids = list(heads)
        self.member_ids = list(dict.fromkeys([*heads, *members]))  # heads are always members


class Project:
    def __init__(self, client_ids=()):
        self.client_ids = list(client_ids)


admin = person("admin")
head_a = person("employee")  # head of folder A
head_b = person("employee")  # head of folder B (sibling of A, same project)
member_a = person("employee")  # plain member of A
reader = person("employee")  # member of B only
outsider = person("employee")  # on no subfolder of this project
other_head = person("employee")  # head of a folder in a different project
client = person("client")

A = Folder(heads=[head_a.id], members=[member_a.id])
B = Folder(heads=[head_b.id], members=[reader.id])
SIBLINGS = [A, B]
OTHER_PROJECT = Folder(heads=[other_head.id])


def check(user, action, expected, folder=A, **ctx):
    ctx.setdefault("siblings", SIBLINGS)
    assert can(user, action, folder, **ctx) is expected, f"{user.role} {action}"


# --- Projects: admin only -----------------------------------------------------------
@pytest.mark.parametrize("action", ["project.create", "project.delete", "project.edit", "subfolder.create_first"])
@pytest.mark.parametrize(
    "who,expected",
    [(admin, True), (head_a, False), (member_a, False), (outsider, False), (client, False)],
)
def test_admin_only_actions(action, who, expected):
    check(who, action, expected)


# --- Create a new subfolder: admin, or head of ANY subfolder in that project ---------
@pytest.mark.parametrize(
    "who,expected",
    [
        (admin, True),
        (head_a, True),
        (head_b, True),  # head of a sibling counts
        (member_a, False),
        (reader, False),
        (outsider, False),
        (other_head, False),  # head, but of a different project
        (client, False),
    ],
)
def test_create_subfolder(who, expected):
    check(who, "subfolder.create", expected, folder=None)


# --- Edit subfolder (name, members, heads) and manage members: admin, or head THERE --
@pytest.mark.parametrize("action", ["subfolder.edit", "members.manage"])
@pytest.mark.parametrize(
    "who,expected",
    [
        (admin, True),
        (head_a, True),
        (head_b, False),  # head of the sibling: read-only here
        (member_a, False),
        (outsider, False),
        (client, False),
    ],
)
def test_edit_subfolder(action, who, expected):
    check(who, action, expected, folder=A)


def test_head_of_one_subfolder_can_edit_only_that_one():
    assert can(head_a, "subfolder.edit", A, siblings=SIBLINGS)
    assert not can(head_a, "subfolder.edit", B, siblings=SIBLINGS)
    assert can(head_b, "subfolder.edit", B, siblings=SIBLINGS)


# --- View subfolders in the same project ------------------------------------------
@pytest.mark.parametrize(
    "who,expected",
    [
        (admin, True),
        (head_a, True),  # read-only on B
        (member_a, True),  # project member
        (reader, True),
        (outsider, False),  # not a project member
        (other_head, False),
        (client, False),
    ],
)
def test_view_other_subfolders(who, expected):
    check(who, "subfolder.view", expected, folder=B)


def test_admin_can_view_a_project_with_no_subfolders():
    assert can(admin, "subfolder.view", None, siblings=[])
    assert not can(outsider, "subfolder.view", None, siblings=[])


# --- Assign tasks --------------------------------------------------------------------
def test_admin_assigns_anyone():
    assert can(admin, "task.assign", A, siblings=SIBLINGS, target_id=outsider.id)


def test_head_assigns_members_and_other_heads_of_their_subfolder():
    other_head_in_a = person("employee")
    folder = Folder(heads=[head_a.id, other_head_in_a.id], members=[member_a.id])
    for target in (member_a.id, other_head_in_a.id, head_a.id):
        assert can(head_a, "task.assign", folder, target_id=target)
    assert not can(head_a, "task.assign", folder, target_id=outsider.id)
    assert not can(head_a, "task.assign", folder, target_id=head_b.id)  # head of a different subfolder
    assert not can(head_a, "task.assign", folder)  # nobody picked


def test_head_cannot_assign_in_a_sibling_subfolder():
    assert not can(head_a, "task.assign", B, siblings=SIBLINGS, target_id=reader.id)


def test_employee_assigns_only_themselves():
    assert can(member_a, "task.assign", A, siblings=SIBLINGS, target_id=member_a.id)
    assert not can(member_a, "task.assign", A, siblings=SIBLINGS, target_id=head_a.id)
    assert not can(outsider, "task.assign", A, siblings=SIBLINGS, target_id=outsider.id)  # not in the subfolder


def test_clients_never_assign():
    assert not can(client, "task.assign", A, siblings=SIBLINGS, target_id=client.id)


# --- Approve / request changes ------------------------------------------------------
@pytest.mark.parametrize(
    "who,approver,expected",
    [
        (admin, None, True),
        (head_a, head_a.id, True),  # picked as approver
        (head_a, head_b.id, False),  # head, but not the one picked
        (head_b, head_b.id, False),  # picked, but head of a different subfolder
        (member_a, member_a.id, False),
        (client, client.id, False),
    ],
)
def test_review_tasks(who, approver, expected):
    check(who, "task.review", expected, folder=A, approver_id=approver)


# --- Deliverables ---------------------------------------------------------------------
@pytest.mark.parametrize(
    "who,expected",
    [(admin, True), (head_a, True), (head_b, False), (member_a, False), (outsider, False), (client, False)],
)
def test_edit_deliverables(who, expected):
    check(who, "deliverable.edit", expected, folder=A)


def test_view_deliverables():
    check(member_a, "deliverable.view", True)
    check(outsider, "deliverable.view", False)
    # A client may view them (view only) when the project lists them as a client.
    mine = person("client")
    assert can(mine, "deliverable.view", A, siblings=SIBLINGS, project=Project([mine.id]))
    assert not can(mine, "deliverable.view", A, siblings=SIBLINGS, project=Project([]))
    assert not can(mine, "deliverable.view", A, siblings=SIBLINGS)


# --- Checklist: add / tick / attach ---------------------------------------------------
@pytest.mark.parametrize(
    "who,expected",
    [(admin, True), (head_a, True), (member_a, True), (reader, False), (outsider, False), (client, False)],
)
def test_checklist(who, expected):
    check(who, "checklist.write", expected, folder=A)


# --- Daily status, office board, calendars and booking -------------------------------
@pytest.mark.parametrize("action", ["status.set", "office.post"])
@pytest.mark.parametrize("who,expected", [(admin, True), (head_a, True), (member_a, True), (client, False)])
def test_team_actions(action, who, expected):
    assert can(who, action) is expected


@pytest.mark.parametrize("action", ["calendar.view", "booking.create"])
def test_calendars_and_booking(action):
    for staff in (admin, head_a, member_a, outsider):
        assert can(staff, action, target_id=uid())
    team_member = uid()
    assert can(client, action, target_id=team_member, team_ids={team_member})  # their project team
    assert not can(client, action, target_id=uid(), team_ids={team_member})  # anyone else
    assert not can(client, action, target_id=team_member)  # no team known
    assert not can(client, action)  # no target


# --- Misc -------------------------------------------------------------------------------
def test_inactive_user_can_do_nothing():
    gone = person("admin", active=False)
    assert not can(gone, "project.create")
    assert not can(gone, "status.set")


def test_unknown_action_denied():
    assert not can(admin, "projects.explode")


def test_require_raises_403():
    with pytest.raises(HTTPException) as exc:
        require(client, "status.set")
    assert exc.value.status_code == 403
    require(admin, "status.set")  # no error


def test_head_is_per_subfolder_not_a_role():
    assert is_head(head_a, A) and not is_head(head_a, B)
    assert not is_head(head_a, None)
    assert is_member(member_a, A) and is_member(head_a, A) and not is_member(member_a, B)
    assert head_a.role == "employee"  # "head" never appears as an account role


# --- Task view / edit / work (progress and timer) ------------------------------------------------------
@pytest.mark.parametrize(
    "who,assignee,expected",
    [
        (admin, None, True),
        (head_a, None, True),
        (member_a, None, True),  # project member
        (reader, None, True),  # member of the sibling: still the same project
        (outsider, None, False),
        (outsider, "self", True),  # assigned to it
        (client, "self", False),
    ],
)
def test_view_task(who, assignee, expected):
    check(who, "task.view", expected, folder=A, target_id=who.id if assignee == "self" else uid())


@pytest.mark.parametrize(
    "who,creator,expected",
    [
        (admin, None, True),
        (head_a, None, True),  # head of the subfolder
        (head_b, None, False),  # head of a sibling
        (member_a, "self", True),  # an employee edits a task they created
        (member_a, None, False),  # ...but not someone else's
        (outsider, "self", False),  # creator, but not a member
        (client, "self", False),
    ],
)
def test_edit_task(who, creator, expected):
    check(who, "task.edit", expected, folder=A, creator_id=who.id if creator == "self" else uid())


@pytest.mark.parametrize("who", [admin, head_a, head_b, member_a, outsider, client])
def test_work_on_task_is_the_assignee_only(who):
    check(who, "task.work", who.role != "client", folder=A, target_id=who.id)  # assignee (not a client)
    check(who, "task.work", False, folder=A, target_id=uid())  # somebody else's task: nobody, not even an admin
