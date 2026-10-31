"""Workspace settings: name, logo, working hours and holidays. Everyone can read them; admins change them."""
import uuid
from datetime import date

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.deps import get_current_user, require_role
from app.models import File, User
from app.models.company import Company
from app.models.workspace import Holiday, HolidayType
from app.services.checklist import delete_files
from app.services.workspace import get_workspace, parse_clock
from app.services.ws_manager import manager

router = APIRouter(prefix="/workspace", tags=["workspace"])


class HolidayOut(BaseModel):
    id: str
    date: str
    end_date: str | None = None
    name: str
    type: HolidayType
    company_ids: list[PydanticObjectId] = Field(default_factory=list)


class WorkspaceOut(BaseModel):
    name: str
    logo_url: str | None
    work_start: str
    work_end: str
    holidays: list[HolidayOut]
    weekly_off: list[int]


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    work_start: str | None = None
    work_end: str | None = None
    logo_file_id: PydanticObjectId | None = None  # an uploaded image
    remove_logo: bool = False
    weekly_off: list[int] | None = None  # Monday=0 .. Sunday=6

    @field_validator("weekly_off")
    @classmethod
    def _weekly_off(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return v
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("weekdays are 0 (Monday) to 6 (Sunday)")
        return sorted(set(v))


def _iso(v: str) -> str:
    try:
        return date.fromisoformat(v).isoformat()
    except ValueError:
        raise ValueError("dates must be YYYY-MM-DD")


class DateRange(BaseModel):
    start: str
    end: str

    @field_validator("start", "end")
    @classmethod
    def _d(cls, v: str) -> str:
        return _iso(v)

    @model_validator(mode="after")
    def _order(self) -> "DateRange":
        if self.end < self.start:
            raise ValueError("a range must end on or after its start")
        return self


class HolidayCreate(BaseModel):
    """The same named holiday on single `dates` and/or continuous `ranges`; empty `company_ids` means every company."""

    date: str | None = None
    dates: list[str] | None = Field(default=None, max_length=366)
    ranges: list[DateRange] | None = Field(default=None, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    type: HolidayType = "company"
    company_ids: list[PydanticObjectId] = Field(default_factory=list)

    @field_validator("date")
    @classmethod
    def _date(cls, v: str | None) -> str | None:
        return _iso(v) if v is not None else v

    @field_validator("dates")
    @classmethod
    def _dates(cls, v: list[str] | None) -> list[str] | None:
        return [_iso(d) for d in v] if v is not None else v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be empty")
        return v

    @model_validator(mode="after")
    def _some_date(self) -> "HolidayCreate":
        if not self.date and not self.dates and not self.ranges:
            raise ValueError("pick at least one date")
        return self


class HolidayUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: HolidayType | None = None
    company_ids: list[PydanticObjectId] | None = None
    date: str | None = None
    end_date: str | None = None  # "" makes it a single day

    @field_validator("date")
    @classmethod
    def _date(cls, v: str | None) -> str | None:
        return _iso(v) if v else v

    @field_validator("end_date")
    @classmethod
    def _end(cls, v: str | None) -> str | None:
        return _iso(v) if v else v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be empty")
        return v


async def _check_companies(ids: list[PydanticObjectId]) -> list[PydanticObjectId]:
    ids = list(dict.fromkeys(ids))
    if ids and await Company.find({"_id": {"$in": ids}}).count() != len(ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown company")
    return ids


async def _changed() -> None:
    """Every open calendar and dashboard reloads the workspace (holidays, weekly off) right away."""
    everyone = await User.find({"is_active": True}).to_list()
    await manager.send_to_users([u.id for u in everyone], "workspace", {})


async def _out() -> WorkspaceOut:
    ws = await get_workspace()
    return WorkspaceOut(
        name=ws.name,
        logo_url=f"/api/v1/files/{ws.logo_file_id}/download" if ws.logo_file_id else None,
        work_start=ws.work_start,
        work_end=ws.work_end,
        holidays=[HolidayOut(**h.model_dump()) for h in sorted(ws.holidays, key=lambda h: h.date)],
        weekly_off=sorted(ws.weekly_off),
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
    if body.weekly_off is not None:
        ws.weekly_off = body.weekly_off

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
    await _changed()
    return await _out()


@router.post("/holidays", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def add_holiday(body: HolidayCreate, _: User = Depends(require_role("admin"))) -> WorkspaceOut:
    ws = await get_workspace()
    companies = await _check_companies(body.company_ids)
    wanted: list[tuple[str, str | None]] = [(d, None) for d in dict.fromkeys([*([body.date] if body.date else []), *(body.dates or [])])]
    wanted += [(r.start, r.end if r.end != r.start else None) for r in body.ranges or []]
    listed = {(h.date, h.end_date, h.name.lower()) for h in ws.holidays}
    new = [w for w in dict.fromkeys(wanted) if (w[0], w[1], body.name.lower()) not in listed]
    if not new:
        raise HTTPException(status.HTTP_409_CONFLICT, "That holiday is already listed")  # entries already on the list are skipped
    ws.holidays.extend(
        Holiday(id=uuid.uuid4().hex, date=d, end_date=e, name=body.name, type=body.type, company_ids=companies) for d, e in new
    )
    await ws.save()
    await _changed()
    return await _out()


@router.patch("/holidays/{holiday_id}", response_model=WorkspaceOut)
async def edit_holiday(holiday_id: str, body: HolidayUpdate, _: User = Depends(require_role("admin"))) -> WorkspaceOut:
    ws = await get_workspace()
    h = next((x for x in ws.holidays if x.id == holiday_id), None)
    if h is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    changes = body.model_fields_set
    if body.name is not None:
        h.name = body.name
    if body.type is not None:
        h.type = body.type
    if body.company_ids is not None:
        h.company_ids = await _check_companies(body.company_ids)
    if body.date:
        h.date = body.date
    if "end_date" in changes:
        h.end_date = body.end_date or None
    if h.end_date and h.end_date < h.date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A range must end on or after its start")
    if h.end_date == h.date:
        h.end_date = None
    await ws.save()
    await _changed()
    return await _out()


@router.delete("/holidays/{holiday_id}", response_model=WorkspaceOut)
async def remove_holiday(holiday_id: str, _: User = Depends(require_role("admin"))) -> WorkspaceOut:
    ws = await get_workspace()
    if not any(h.id == holiday_id for h in ws.holidays):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    ws.holidays = [h for h in ws.holidays if h.id != holiday_id]
    await ws.save()
    await _changed()
    return await _out()
