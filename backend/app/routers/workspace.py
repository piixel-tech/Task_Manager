"""Workspace settings: name, logo, working hours and holidays. Everyone can read them; admins change them."""
import uuid
from datetime import date

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, require_role
from app.models import File, User
from app.models.workspace import Holiday, HolidayType
from app.services.checklist import delete_files
from app.services.workspace import get_workspace, parse_clock

router = APIRouter(prefix="/workspace", tags=["workspace"])


class HolidayOut(BaseModel):
    id: str
    date: str
    name: str
    type: HolidayType


class WorkspaceOut(BaseModel):
    name: str
    logo_url: str | None
    work_start: str
    work_end: str
    holidays: list[HolidayOut]


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    work_start: str | None = None
    work_end: str | None = None
    logo_file_id: PydanticObjectId | None = None  # an uploaded image
    remove_logo: bool = False


class HolidayCreate(BaseModel):
    date: str
    name: str = Field(min_length=1, max_length=100)
    type: HolidayType = "company"

    @field_validator("date")
    @classmethod
    def _date(cls, v: str) -> str:
        try:
            return date.fromisoformat(v).isoformat()
        except ValueError:
            raise ValueError("date must be YYYY-MM-DD")

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be empty")
        return v


async def _out() -> WorkspaceOut:
    ws = await get_workspace()
    return WorkspaceOut(
        name=ws.name,
        logo_url=f"/api/v1/files/{ws.logo_file_id}/download" if ws.logo_file_id else None,
        work_start=ws.work_start,
        work_end=ws.work_end,
        holidays=[HolidayOut(**h.model_dump()) for h in sorted(ws.holidays, key=lambda h: h.date)],
    )


@router.get("", response_model=WorkspaceOut, dependencies=[Depends(get_current_user)])
async def read_workspace() -> WorkspaceOut:
    return await _out()


@router.put("", response_model=WorkspaceOut)
async def update_workspace(body: WorkspaceUpdate, admin: User = Depends(require_role("admin"))) -> WorkspaceOut:
    ws = await get_workspace()
    if body.name is not None:
        ws.name = " ".join(body.name.split())
    start, end = body.work_start or ws.work_start, body.work_end or ws.work_end
    if parse_clock(start) >= parse_clock(end):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Working hours must end after they start")
    ws.work_start, ws.work_end = f"{parse_clock(start):%H:%M}", f"{parse_clock(end):%H:%M}"

    old_logo = None
    if body.remove_logo and ws.logo_file_id:
        old_logo, ws.logo_file_id = ws.logo_file_id, None
    if body.logo_file_id:
        f = await File.get(body.logo_file_id)
        if f is None or f.kind != "upload" or not f.mime.startswith("image/") or f.owner_id != admin.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Upload an image first, then choose it as the logo")
        if ws.logo_file_id and ws.logo_file_id != f.id:
            old_logo = ws.logo_file_id
        ws.logo_file_id = f.id
    await ws.save()
    if old_logo:
        await delete_files([old_logo])  # a replaced logo is not kept
    return await _out()


@router.post("/holidays", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def add_holiday(body: HolidayCreate, _: User = Depends(require_role("admin"))) -> WorkspaceOut:
    ws = await get_workspace()
    if any(h.date == body.date and h.name.lower() == body.name.lower() for h in ws.holidays):
        raise HTTPException(status.HTTP_409_CONFLICT, "That holiday is already listed")
    ws.holidays.append(Holiday(id=uuid.uuid4().hex, date=body.date, name=body.name, type=body.type))
    await ws.save()
    return await _out()


@router.delete("/holidays/{holiday_id}", response_model=WorkspaceOut)
async def remove_holiday(holiday_id: str, _: User = Depends(require_role("admin"))) -> WorkspaceOut:
    ws = await get_workspace()
    if not any(h.id == holiday_id for h in ws.holidays):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    ws.holidays = [h for h in ws.holidays if h.id != holiday_id]
    await ws.save()
    return await _out()
