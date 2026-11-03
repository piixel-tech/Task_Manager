"""Google Drive / Docs / Sheets for the signed-in person: the Picker's token, attaching a Drive file, creating a Doc or Sheet.

Only ever the caller's own connection. Problems come back as 409 `{code, message, service}` (see integrations/google/workspace.py).
"""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.core.permissions import require
from app.integrations.google import workspace
from app.models import User
from app.schemas.file import FileOut

router = APIRouter(prefix="/integrations/google", tags=["google"])


class DriveItem(BaseModel):
    id: str
    name: str
    mime: str
    kind: str
    is_folder: bool
    icon_url: str | None = None
    thumbnail_url: str | None = None
    modified_at: datetime | None = None
    size: int = 0
    starred: bool = False


class DriveListing(BaseModel):
    items: list[DriveItem]
    next_page_token: str | None = None


class DriveAttach(BaseModel):
    drive_id: str = Field(min_length=8, max_length=200)


class DriveCreate(BaseModel):
    kind: Literal["document", "spreadsheet"]
    title: str = Field(default="", max_length=200)


@router.get("/drive/files", response_model=DriveListing)
async def browse_drive(
    view: Literal["my", "shared", "recent", "starred"] = "my",
    parent: str | None = Query(default=None, max_length=200, description="A folder id; leave out for the top of the view"),
    q: str = Query(default="", max_length=200, description="Search by name"),
    kind: Literal["any", "document", "spreadsheet"] = "any",
    page_token: str | None = Query(default=None, max_length=2000),
    user: User = Depends(get_current_user),
) -> DriveListing:
    """The person's own Drive, for the file browser. Read-only: nothing is stored until they attach something."""
    require(user, "integration.manage")
    return DriveListing(**await workspace.browse_drive(user, view, parent, q, kind, page_token))


@router.post("/drive/attach", response_model=FileOut, status_code=201)
async def attach_drive_file(body: DriveAttach, user: User = Depends(get_current_user)):
    """Keep the link and metadata of a file picked in Google Drive. The returned file is then attached like any other."""
    require(user, "integration.manage")
    return await workspace.attach_drive_file(user, body.drive_id)


@router.post("/drive/create", response_model=FileOut, status_code=201)
async def create_drive_file(body: DriveCreate, user: User = Depends(get_current_user)):
    """Create an empty Google Doc or Sheet in the person's Drive and link it."""
    require(user, "integration.manage")
    return await workspace.create_drive_file(user, body.kind, body.title)
