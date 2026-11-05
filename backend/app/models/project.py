from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

from app.models.deliverable import StageDef


Visibility = Literal["private", "view_only", "open"]


class Project(Document):
    name: str
    company_id: PydanticObjectId  # the main company; always first in `companies_of`
    extra_company_ids: list[PydanticObjectId] = Field(default_factory=list)  # a project can belong to more than one company
    start_date: str | None = None  # YYYY-MM-DD
    description: str = ""  # short, up to 200 characters
    client_ids: list[PydanticObjectId] = Field(default_factory=list)
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "projects"


class Subfolder(Document):
    project_id: PydanticObjectId
    name: str
    head_ids: list[PydanticObjectId] = Field(default_factory=list)
    member_ids: list[PydanticObjectId] = Field(default_factory=list)  # always includes the heads
    file_ids: list[PydanticObjectId] = Field(default_factory=list)  # Google Docs / Sheets / Drive files linked to the subfolder
    deliverable_stages: list[StageDef] | None = None  # None = the legacy seven stages (see models/deliverable.py)
    # Who beyond its members can see it: private (nobody), view_only (everyone in the project's companies can read it), open (they can also work in it).
    visibility: Visibility = "private"
    company_ids: list[PydanticObjectId] = Field(default_factory=list)  # the project's companies, copied here so permission checks need no extra lookup
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "subfolders"
        indexes = [
            IndexModel([("project_id", 1)]),
            IndexModel([("member_ids", 1)]),
            IndexModel([("head_ids", 1)]),
            IndexModel([("visibility", 1), ("company_ids", 1)]),
        ]
