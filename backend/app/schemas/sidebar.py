from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator

MAX_IDS = 300
MAX_KEY = 60


class SidebarState(BaseModel):
    """What the sidebar remembers for one person."""

    open: list[str] = Field(default_factory=list, max_length=MAX_IDS)  # ids of expanded nodes
    order: dict[str, list[str]] = Field(default_factory=dict)  # parent id -> children in the order they chose

    @field_validator("open")
    @classmethod
    def _open(cls, v: list[str]) -> list[str]:
        if any(not k or len(k) > MAX_KEY for k in v):
            raise ValueError("Invalid node id")
        return list(dict.fromkeys(v))

    @field_validator("order")
    @classmethod
    def _order(cls, v: dict[str, list[str]]) -> dict[str, list[str]]:
        if len(v) > MAX_IDS or any(not k or len(k) > MAX_KEY or len(ids) > MAX_IDS for k, ids in v.items()):
            raise ValueError("Too many entries")
        if any(not i or len(i) > MAX_KEY for ids in v.values() for i in ids):
            raise ValueError("Invalid node id")
        return {k: list(dict.fromkeys(ids)) for k, ids in v.items()}


class SubfolderNode(BaseModel):
    id: PydanticObjectId
    name: str
    open_tasks: int  # tasks assigned to me that are still open
    is_head: bool
    can_add_task: bool  # a task for yourself here (heads can also assign to their members from the form)
    can_add_checklist: bool
    can_edit_deliverables: bool
    can_chat: bool  # start a chat group linked to it
    can_rename: bool
    can_delete: bool
    visibility: Literal["private", "view_only", "open"] = "private"
    can_work: bool = False  # false when you can only read it (view-only)


class ProjectNode(BaseModel):
    id: PydanticObjectId
    name: str
    open_tasks: int
    can_rename: bool
    can_delete: bool
    can_add_subfolder: bool
    can_add_requirement: bool
    subfolders: list[SubfolderNode]


class SidebarTree(BaseModel):
    projects: list[ProjectNode]
    can_create_project: bool
