from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import IndexModel

STAGES = ("writing", "shoot_pending", "shoot", "editing", "waiting_approval", "approved", "posted")
Stage = Literal["writing", "shoot_pending", "shoot", "editing", "waiting_approval", "approved", "posted"]


class DeliverableItem(BaseModel):
    id: str  # stable handle for the stage dropdown
    type: str  # e.g. "Reels"
    number: int  # 1-based within the type
    title: str  # e.g. "Reels 3"
    stage: Stage = "writing"
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
