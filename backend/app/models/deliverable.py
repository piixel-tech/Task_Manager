from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import IndexModel


class StageDef(BaseModel):
    """One stage of a subfolder's deliverables. `key` never changes (items point at it), `label` is what people read and can be renamed."""

    key: str
    label: str


# What a subfolder had before stages became editable: it keeps these until someone edits its stages.
LEGACY_STAGES = [
    StageDef(key="writing", label="Writing"),
    StageDef(key="shoot_pending", label="Shoot pending"),
    StageDef(key="shoot", label="Shoot"),
    StageDef(key="editing", label="Editing"),
    StageDef(key="waiting_approval", label="Waiting approval"),
    StageDef(key="approved", label="Approved"),
    StageDef(key="posted", label="Posted"),
]
# What a new subfolder starts with.
DEFAULT_STAGES = [
    StageDef(key="shooted", label="Shooted"),
    StageDef(key="editing", label="Editing"),
    StageDef(key="reel", label="Reel"),
    StageDef(key="posted", label="Posted"),
]
MIN_STAGES = 2
MAX_STAGES = 12


class DeliverableItem(BaseModel):
    id: str  # stable handle for the stage dropdown
    type: str  # e.g. "Reels"
    number: int  # 1-based within the type
    title: str  # e.g. "Reels 3"
    stage: str = "writing"  # a StageDef.key of the subfolder
    updated_by: PydanticObjectId | None = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DeliverablePlan(Document):
    """One subfolder's deliverables for one month (YYYY-MM)."""

    subfolder_id: PydanticObjectId
    month: str
    items: list[DeliverableItem] = Field(default_factory=list)

    class Settings:
        name = "deliverable_plans"
        indexes = [IndexModel([("subfolder_id", 1), ("month", 1)], unique=True)]
