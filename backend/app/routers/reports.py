from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.core.deps import get_current_user, require_role
from app.core.permissions import require
from app.models import File, User
from app.schemas.report import ReportList, ReportOut
from app.services.monthly_report import employees_for, get_report, list_row, valid_month
from app.services.report_pdf import file_name, render_pdf, zip_reports
from app.services.storage import Storage, get_storage
from app.services.workspace import get_workspace

router = APIRouter(prefix="/reports", tags=["reports"])


def _month(value: str) -> str:
    if not valid_month(value):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "month must be YYYY-MM, and not in the future")
    return value


async def _employee(user_id: PydanticObjectId, viewer: User) -> User:
    """The employee whose report this is. Employees may only ask for themselves; admins for any employee; nobody else for anyone."""
    require(viewer, "report.view", target_id=user_id)
    target = await User.get(user_id)
    if target is None or target.role != "employee":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return target


async def _brand(storage: Storage) -> tuple[bytes | None, str]:
    """The workspace logo (if it is an uploaded image) and name, for the PDF header."""
    try:
        ws = await get_workspace()
        logo = None
        if ws.logo_file_id:
            f = await File.get(ws.logo_file_id)
            path = storage.get_path(f.storage_key) if f and f.storage_key else None
            logo = path.read_bytes() if path and path.is_file() else None
        return logo, ws.name or "Task Manager"
    except Exception:  # the PDF is still worth having without a logo
        return None, "Task Manager"


@router.get("/monthly", response_model=ReportList)
async def monthly_list(
    month: str,
    company_id: PydanticObjectId | None = None,
    q: str = "",
    _: User = Depends(require_role("admin")),
) -> ReportList:
    """Admin: one row per employee for a month."""
    month = _month(month)
    return ReportList(month=month, rows=[list_row(await get_report(u, month)) for u in await employees_for(month, company_id, q)])


@router.get("/monthly/all.zip")
async def monthly_zip(
    month: str,
    company_id: PydanticObjectId | None = None,
    q: str = "",
    _: User = Depends(require_role("admin")),
    storage: Storage = Depends(get_storage),
) -> Response:
    """Admin: every listed employee's PDF in one ZIP (the same filters as the list)."""
    month = _month(month)
    reports = [await get_report(u, month) for u in await employees_for(month, company_id, q)]
    if not reports:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No employees match")
    return Response(zip_reports(reports, *await _brand(storage)), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="Monthly-Reports-{month}.zip"'})


@router.get("/monthly/{user_id}", response_model=ReportOut)
async def monthly_report(user_id: PydanticObjectId, month: str, viewer: User = Depends(get_current_user)) -> ReportOut:
    """Read-only. The current month is live ("in progress"); a finished month is the frozen snapshot."""
    return await get_report(await _employee(user_id, viewer), _month(month))


@router.get("/monthly/{user_id}/pdf")
async def monthly_pdf(user_id: PydanticObjectId, month: str, viewer: User = Depends(get_current_user), storage: Storage = Depends(get_storage)) -> Response:
    report = await get_report(await _employee(user_id, viewer), _month(month))
    return Response(render_pdf(report, *await _brand(storage)), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{file_name(report)}"'})
