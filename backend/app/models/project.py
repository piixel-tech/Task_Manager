from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


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
    created_by: PydanticObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "subfolders"
        indexes = [
            IndexModel([("project_id", 1)]),
            IndexModel([("member_ids", 1)]),
            IndexModel([("head_ids", 1)]),
        ]
