"""Helpers for client requirements."""
from typing import Iterable

from beanie import PydanticObjectId

from app.core.permissions import can, is_head
from app.core.timeutil import as_utc
from app.models import File, Project, Subfolder, User
from app.models.requirement import Requirement
from app.schemas.file import FileOut
from app.schemas.requirement import Badge, RequirementDetail, RequirementOut, SubfolderTag, VersionOut
from app.services.checklist import delete_files
from app.services.projects import brief, load_users, notify_people, unique


def badge_for(author: User | None, siblings: list[Subfolder]) -> Badge:
    """What to call the author today: Client, Head (of a subfolder in this project), Admin, or just a team member."""
    if author is None:
        return "member"
    if author.role == "admin":
        return "admin"
    if author.role == "client":
        return "client"
    return "head" if any(is_head(author, s) for s in siblings) else "member"


def _files(ids: Iterable[PydanticObjectId], found: dict[PydanticObjectId, File]) -> list[FileOut]:
    return [FileOut.model_validate(found[i], from_attributes=True) for i in ids if i in found]


async def _lookups(reqs: list[Requirement], with_history: bool):
    versions = [v for r in reqs for v in r.history] if with_history else []
    file_ids = unique([*(a for r in reqs for a in r.attachment_ids), *(a for v in versions for a in v.attachment_ids)])
    files = {f.id: f for f in await File.find({"_id": {"$in": file_ids}}).to_list()} if file_ids else {}
    people = await load_users([r.created_by for r in reqs] + [v.edited_by for v in versions])
    return files, people


def _tag(sub_id: PydanticObjectId | None, names: dict[PydanticObjectId, str]) -> SubfolderTag | None:
    return SubfolderTag(id=sub_id, name=names[sub_id]) if sub_id in names else None


def _out(r: Requirement, viewer: User, project: Project, siblings: list[Subfolder], files, people, names) -> RequirementOut:
    author = people.get(r.created_by)
    return RequirementOut(
        id=r.id,
        project_id=r.project_id,
        subfolder=_tag(r.subfolder_id, names),
        title=r.title,
        details=r.details,
        attachments=_files(r.attachment_ids, files),
        author=brief(author) if author else None,
        author_badge=badge_for(author, siblings),
        created_at=as_utc(r.created_at),
        updated_at=as_utc(r.updated_at),
        edited=bool(r.history),
        version_count=len(r.history) + 1,
        can_edit=can(viewer, "requirement.edit", creator_id=r.created_by, siblings=siblings, project=project),
        can_delete=can(viewer, "requirement.delete"),
    )


def _names(siblings: list[Subfolder], viewer: User) -> dict[PydanticObjectId, str]:
    """Subfolder names the viewer may see. Clients see the project's subfolders as before; the team only the ones they can open."""
    return {s.id: s.name for s in siblings if viewer.role == "client" or can(viewer, "subfolder.view", s)}


async def requirement_outs(reqs: list[Requirement], viewer: User, project: Project, siblings: list[Subfolder]) -> list[RequirementOut]:
    files, people = await _lookups(reqs, with_history=False)
    names = _names(siblings, viewer)
    return [_out(r, viewer, project, siblings, files, people, names) for r in reqs]


async def requirement_detail(r: Requirement, viewer: User, project: Project, siblings: list[Subfolder]) -> RequirementDetail:
    files, people = await _lookups([r], with_history=True)
    names = _names(siblings, viewer)
    base = _out(r, viewer, project, siblings, files, people, names)
    versions = [
        VersionOut(
            number=i + 1,
            current=False,
            title=v.title,
            details=v.details,
            attachments=_files(v.attachment_ids, files),
            subfolder=_tag(v.subfolder_id, names),
            edited_by=brief(people[v.edited_by]) if v.edited_by in people else None,
            edited_at=as_utc(v.edited_at),
        )
        for i, v in enumerate(r.history)
    ]
    versions.append(
        VersionOut(
            number=len(r.history) + 1,
            current=True,
            title=r.title,
            details=r.details,
            attachments=base.attachments,
            subfolder=base.subfolder,
            edited_by=base.author,
            edited_at=as_utc(r.updated_at),
        )
    )
    return RequirementDetail(**base.model_dump(), versions=list(reversed(versions)))


async def watchers(siblings: list[Subfolder]) -> list[PydanticObjectId]:
    """Who hears about requirement changes: every head in the project, and every admin."""
    admins = await User.find(User.role == "admin", User.is_active == True).to_list()  # noqa: E712
    return unique([*(h for s in siblings for h in s.head_ids), *(a.id for a in admins)])


async def tell_watchers(
    project: Project, siblings: list[Subfolder], actor: User, *, type: str, title: str, body: str, extra: Iterable[PydanticObjectId] = ()
) -> None:
    await notify_people(
        [*await watchers(siblings), *extra], type=type, title=title, body=body, project_id=project.id, actor=actor, tab="requirements"
    )


async def delete_project_requirements(project_ids: list[PydanticObjectId]) -> None:
    """Requirements (with every file ever attached) of projects that are going away."""
    reqs = await Requirement.find({"project_id": {"$in": project_ids}}).to_list()
    await Requirement.find({"project_id": {"$in": project_ids}}).delete()
    await delete_files(unique(a for r in reqs for a in [*r.attachment_ids, *(x for v in r.history for x in v.attachment_ids)]))
