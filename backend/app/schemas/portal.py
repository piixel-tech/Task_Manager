from beanie import PydanticObjectId
from pydantic import BaseModel

from app.schemas.chat import ApprovalItem
from app.schemas.deliverable import DeliverablesOut
from app.schemas.project import UserBrief
from app.schemas.requirement import RequirementOut


class Ref(BaseModel):
    id: PydanticObjectId
    name: str


class PortalPerson(BaseModel):
    user: UserBrief
    is_head: bool  # head of a subfolder in this project


class PortalProject(BaseModel):
    """A client's view of one of their projects: its subfolders and the team they can meet."""

    id: PydanticObjectId
    name: str
    company_id: PydanticObjectId
    subfolders: list[Ref]
    team: list[PortalPerson]


class DeliverablesTotals(BaseModel):
    total: int
    done: int  # items that reached the last stage (posted)
    remaining: int
    progress: int  # 0-100: how far every item has moved along the stages


class PortalSummary(BaseModel):
    month: str
    pending_approvals: int
    approvals: list[ApprovalItem]  # the newest few
    deliverables: DeliverablesTotals
    latest_requirements: list[RequirementOut]


class PortalDeliverables(BaseModel):
    project: Ref
    subfolder: Ref
    deliverables: DeliverablesOut
