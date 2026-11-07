"""Single place for permission rules: the Roles table in SPEC.md.

    can(user, action, subfolder=None, **context) -> bool
    require(user, action, subfolder=None, **context)   # raises 403

"Head" is not an account role. It is derived per subfolder from `subfolder.head_ids`,
so anything that depends on it needs the subfolder. Context (all optional):

    siblings     every subfolder of the subfolder's project. Needed for "member of the
                 project" and "head of any subfolder in the project". Defaults to [subfolder].
    project      the project (for a client's `client_ids`).
    target_id    the user being acted on (task assignee, calendar owner).
    creator_id   who created the task (for task.edit).
    approver_id  the approver picked on a submission.
    assigned_id  who a comment is assigned to (for activity.resolve).
    team_ids     user ids on the projects a client belongs to (for client calendars/booking).

Invariant kept by the routers: every head is also in `member_ids`.

Subfolder visibility (`subfolder.visibility`; `subfolder.company_ids` = the project's companies; `subfolder.viewer_ids` = picked people):

    hidden     only its members, its heads and admins can see it. The default.
    everyone   every team member of the project's companies can also see and read it.
    selected   the people picked in `viewer_ids` can also see and read it.

Whoever is not a member is ALWAYS view-only, in every option: they cannot add or edit tasks, files, the checklist, deliverables
or comments. Only members, heads and admins work in a subfolder (`works_in`).

Seeing a subfolder is what every read of its tasks, checklist, deliverables, activity and chat link hangs on, so the one
rule lives here (`sees` / `works_in`) and the routers filter their lists with `visible_filter` in services/projects.py.
Clients keep their own access through the project (portal, deliverables, requirements); visibility is about the team.
"""
from typing import Any, Collection

from fastapi import HTTPException, status

from app.models import User

STAFF_ROLES = ("admin", "employee")


def is_head(user: User, subfolder: Any | None) -> bool:
    return subfolder is not None and user.id in (getattr(subfolder, "head_ids", None) or [])


def is_member(user: User, subfolder: Any | None) -> bool:
    """Member or head of this subfolder."""
    if subfolder is None:
        return False
    people = list(getattr(subfolder, "member_ids", None) or []) + list(getattr(subfolder, "head_ids", None) or [])
    return user.id in people


def _shared_with(user: User, subfolder: Any | None) -> bool:
    """A team member this subfolder is shared with beyond its members: the whole company ("everyone") or the picked people ("selected")."""
    if subfolder is None or user.role not in STAFF_ROLES:
        return False
    level = getattr(subfolder, "visibility", None)
    if level == "everyone":
        company = getattr(user, "company_id", None)
        return company is not None and company in (getattr(subfolder, "company_ids", None) or [])
    if level == "selected":
        return user.id in (getattr(subfolder, "viewer_ids", None) or [])
    return False


def sees(user: User, subfolder: Any | None) -> bool:
    """May this person open the subfolder and read it."""
    if subfolder is None or not user.is_active:
        return False
    return user.role == "admin" or (user.role in STAFF_ROLES and (is_member(user, subfolder) or _shared_with(user, subfolder)))


def works_in(user: User, subfolder: Any | None) -> bool:
    """May this person work in it: add tasks and checklist items, move deliverables, post. Members, heads and admins only."""
    if subfolder is None or not user.is_active:
        return False
    return user.role == "admin" or (user.role in STAFF_ROLES and is_member(user, subfolder))


def can(
    user: User,
    action: str,
    subfolder: Any | None = None,
    *,
    siblings: Collection[Any] | None = None,
    project: Any | None = None,
    target_id: Any | None = None,
    approver_id: Any | None = None,
    creator_id: Any | None = None,
    assigned_id: Any | None = None,
    team_ids: Collection[Any] | None = None,
) -> bool:
    if not user.is_active:
        return False

    admin = user.role == "admin"
    staff = user.role in STAFF_ROLES
    client = user.role == "client"

    if siblings is None:
        siblings = [subfolder] if subfolder is not None else []
    head = is_head(user, subfolder)
    member = is_member(user, subfolder)  # a member of this subfolder (or of this chat group)
    worker = staff and works_in(user, subfolder)  # member, or anyone on the team when the subfolder is open
    visible = staff and sees(user, subfolder)
    in_project = any(is_member(user, s) for s in siblings)
    sees_any = any(sees(user, s) for s in siblings)  # can open at least one subfolder of the project
    head_of_any = any(is_head(user, s) for s in siblings)

    # --- Projects and subfolders ---------------------------------------------------
    if action in ("project.create", "project.delete", "project.edit", "subfolder.create_first"):
        return admin
    if action == "subfolder.create":  # a new sibling in a project that already has subfolders
        return admin or (staff and head_of_any)
    if action == "subfolder.delete":  # remove a subfolder with its tasks: admins, and the heads of that subfolder
        return admin or (staff and head)
    if action in ("subfolder.edit", "members.manage"):  # name, members, heads; add members / invite clients
        return admin or (staff and head)
    if action == "subfolder.view":  # one subfolder (see `sees`); with no subfolder: the project page, if any of its subfolders is visible
        return sees(user, subfolder) if subfolder is not None else (admin or (staff and sees_any))
    if action == "subfolder.visibility":  # who beyond the members can see it (hidden / everyone / selected): admins and the heads of that subfolder
        return admin or (staff and head)

    # --- Work inside a subfolder ---------------------------------------------------
    if action == "task.assign":
        if admin:
            return True
        if not staff or target_id is None:
            return False
        if head:  # members and other heads of their subfolder
            return target_id in (list(subfolder.member_ids) + list(subfolder.head_ids))
        return worker and target_id == user.id  # employees: only themselves
    if action == "task.view":  # whoever can see the subfolder, plus whoever the task is assigned to
        return admin or (staff and (visible or target_id == user.id))
    if action == "task.edit":  # details, assets, reassigning, deleting
        return admin or (staff and (head or (worker and creator_id == user.id)))
    if action == "activity.resolve":  # tick a mid-way change or comment: heads, admins, the task's assignee, the comment's author or assignee
        return admin or (staff and (head or target_id == user.id or creator_id == user.id or assigned_id == user.id))
    if action == "activity.post":  # a comment or a mid-way change: members, anyone on the team in an open subfolder, the task's assignee. Not view-only readers.
        return admin or (staff and (worker or target_id == user.id))
    if action == "activity.delete":  # your own entry, or an admin
        return admin or (staff and creator_id == user.id)
    if action == "task.work":  # progress and timer: the assignee only
        return staff and target_id == user.id
    if action == "task.stop":  # stop your own running timer: always allowed
        return staff and target_id == user.id
    if action == "task.review":  # approve / request changes, only when picked as approver
        return admin or (staff and head and approver_id == user.id)
    if action == "deliverable.edit":
        return admin or (staff and head)
    if action == "deliverable.view":
        if client:
            return project is not None and user.id in (getattr(project, "client_ids", None) or [])
        return admin or visible
    if action == "deliverable.stage":  # any member moves an item along the stages
        return admin or worker
    if action == "checklist.view":
        return admin or visible
    if action == "checklist.write":  # add / edit own / attach
        return admin or worker

    # --- Client requirements (pass the project and all its subfolders as `siblings`) --
    if action in ("requirement.view", "requirement.add", "requirement.edit", "requirement.delete"):
        if action == "requirement.delete":  # admins only
            return admin
        client_of = client and project is not None and user.id in (getattr(project, "client_ids", None) or [])
        if action == "requirement.add":  # the project's clients, admins, heads of any subfolder in the project
            return admin or client_of or (staff and head_of_any)
        can_see = admin or client_of or (staff and in_project)  # project members can view
        if action == "requirement.edit":  # the author, while they can still see the project
            return can_see and creator_id == user.id
        return can_see

    # --- Monthly reports: an employee reads their own, an admin reads everyone's; nobody else (heads and clients included) ---
    if action == "report.view":
        return admin or (user.role == "employee" and target_id == user.id)

    # --- Chat (the "subfolder" argument is the chat group for member / manage) -------
    if action == "chat.create":  # start groups, add people
        return staff
    if action == "chat.list":  # see the groups you are in
        return staff or client
    if action == "chat.member":  # read, send, react, forward, delete your own; only groups you are in (admins too)
        if client:
            return user.id in (getattr(subfolder, "client_ids", None) or [])
        return staff and member
    if action == "chat.invite":  # client invite links: admins, and heads of the group's linked subfolder (pass it in)
        return admin or (staff and head)
    if action == "chat.request_approval":  # send an approval card: team members of the group
        return staff and member
    if action == "chat.answer_approval":  # answer one: the clients in the group
        return client and user.id in (getattr(subfolder, "client_ids", None) or [])
    if action == "chat.pin":  # pin or unpin a message: the team members of the group (clients read pins)
        return staff and member
    if action == "chat.manage":  # rename, link a subfolder, remove people, delete: the creator
        return staff and member and creator_id == user.id
    if action == "chat.link":  # link a group to a subfolder you can work in (pass the subfolder)
        return admin or worker

    # --- Everyone on the team ------------------------------------------------------
    if action in ("status.set", "office.post", "office.view"):
        return staff
    if action == "leave.request":  # ask for leave / work from home, and see and cancel your own requests: employees
        return user.role == "employee"
    if action == "leave.review":  # decide the requests sent to you: admins (the router also checks it was sent to this admin)
        return admin
    if action == "office.resolve":  # the author or an admin
        return admin or (staff and creator_id == user.id)
    if action == "integration.manage":  # connect your own Google Calendar etc.; clients have no calendar of their own
        return staff
    if action in ("calendar.view", "booking.create"):
        if staff:
            return True
        return client and target_id is not None and target_id in (team_ids or ())  # their project team only

    return False


def require(user: User, action: str, subfolder: Any | None = None, **context: Any) -> None:
    if not can(user, action, subfolder, **context):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
