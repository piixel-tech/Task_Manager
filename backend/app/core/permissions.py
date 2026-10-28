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
    member = is_member(user, subfolder)
    in_project = any(is_member(user, s) for s in siblings)
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
    if action == "subfolder.view":  # read-only for everyone who isn't admin / head of that subfolder
        return admin or (staff and in_project)

    # --- Work inside a subfolder ---------------------------------------------------
    if action == "task.assign":
        if admin:
            return True
        if not staff or target_id is None:
            return False
        if head:  # members and other heads of their subfolder
            return target_id in (list(subfolder.member_ids) + list(subfolder.head_ids))
        return member and target_id == user.id  # employees: only themselves
    if action == "task.view":  # project members, plus whoever the task is assigned to
        return admin or (staff and (in_project or target_id == user.id))
    if action == "task.edit":  # details, assets, reassigning, deleting
        return admin or (staff and (head or (member and creator_id == user.id)))
    if action == "activity.resolve":  # tick a mid-way change or comment: heads, admins, the task's assignee, the comment's author or assignee
        return admin or (staff and (head or target_id == user.id or creator_id == user.id or assigned_id == user.id))
    if action == "activity.delete":  # your own entry, or an admin
        return admin or (staff and creator_id == user.id)
    if action == "task.work":  # progress and timer: the assignee only
        return staff and target_id == user.id
    if action == "task.review":  # approve / request changes, only when picked as approver
        return admin or (staff and head and approver_id == user.id)
    if action == "deliverable.edit":
        return admin or (staff and head)
    if action == "deliverable.view":
        if client:
            return project is not None and user.id in (getattr(project, "client_ids", None) or [])
        return admin or (staff and in_project)
    if action == "deliverable.stage":  # any member moves an item along the stages
        return admin or (staff and member)
    if action == "checklist.view":
        return admin or (staff and in_project)
    if action == "checklist.write":  # add / edit own / attach
        return admin or (staff and member)

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
    if action == "chat.link":  # link a group to a subfolder you belong to (pass the subfolder)
        return admin or (staff and member)

    # --- Everyone on the team ------------------------------------------------------
    if action in ("status.set", "office.post", "office.view"):
        return staff
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
