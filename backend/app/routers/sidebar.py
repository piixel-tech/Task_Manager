"""Data for the left sidebar: the project tree with what this person may do at each node, and what they collapsed."""
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_current_user
from app.core.permissions import can
from app.models import Project, Subfolder, Task, User
from app.models.task import OPEN_STATUSES
from app.schemas.sidebar import ProjectNode, SidebarState, SidebarTree, SubfolderNode
from app.services.projects import project_ids_for_staff

router = APIRouter(prefix="/sidebar", tags=["sidebar"])


@router.get("/tree", response_model=SidebarTree)
async def tree(user: User = Depends(get_current_user)) -> SidebarTree:
    """Projects (all for admins, yours otherwise) with their subfolders, my open task counts, and the actions allowed on each."""
    if user.role == "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    if user.role == "admin":
        projects = await Project.find_all().to_list()
    else:
        projects = await Project.find({"_id": {"$in": await project_ids_for_staff(user)}}).to_list()
    projects.sort(key=lambda p: p.name.lower())

    subs_by_project: dict = {p.id: [] for p in projects}
    for s in await Subfolder.find({"project_id": {"$in": list(subs_by_project)}}).sort("+created_at").to_list():
        subs_by_project[s.project_id].append(s)

    rows = await Task.get_motor_collection().aggregate(
        [
            {"$match": {"assignee_id": user.id, "status": {"$in": list(OPEN_STATUSES)}}},
            {"$group": {"_id": "$subfolder_id", "n": {"$sum": 1}}},
        ]
    ).to_list(None)
    open_by_sub = {r["_id"]: r["n"] for r in rows}

    nodes = []
    for p in projects:
        siblings = subs_by_project[p.id]
        subs = [
            SubfolderNode(
                id=s.id,
                name=s.name,
                open_tasks=open_by_sub.get(s.id, 0),
                is_head=user.id in s.head_ids,
                can_add_task=can(user, "task.assign", s, target_id=user.id),
                can_add_checklist=can(user, "checklist.write", s),
                can_edit_deliverables=can(user, "deliverable.edit", s),
                can_chat=can(user, "chat.create") and can(user, "chat.link", s),
                can_rename=can(user, "subfolder.edit", s, siblings=siblings),
                can_delete=can(user, "subfolder.delete", s) and len(siblings) > 1,  # a project keeps at least one
                visibility=s.visibility,
                can_work=can(user, "checklist.write", s),
            )
            for s in siblings
            if can(user, "subfolder.view", s)  # a hidden subfolder never shows up
        ]
        nodes.append(
            ProjectNode(
                id=p.id,
                name=p.name,
                open_tasks=sum(s.open_tasks for s in subs),
                can_rename=can(user, "project.edit"),
                can_delete=can(user, "project.delete"),
                can_add_subfolder=can(user, "subfolder.create", siblings=siblings),
                can_add_requirement=can(user, "requirement.add", project=p, siblings=siblings),
                subfolders=subs,
            )
        )
    return SidebarTree(projects=nodes, can_create_project=can(user, "project.create"))


@router.put("/state", response_model=SidebarState)
async def save_state(body: SidebarState, user: User = Depends(get_current_user)) -> SidebarState:
    """Remember which nodes are open and the order this person arranged. Saved on their account, so it follows them to any device."""
    user.sidebar_state = body.model_dump()
    await user.save()
    return body
