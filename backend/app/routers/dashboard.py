from fastapi import APIRouter, Depends

from app.core.deps import require_role
from app.models import User
from app.schemas.dashboard import AdminDashboard
from app.services.dashboard import admin_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/admin", response_model=AdminDashboard)
async def admin_home(user: User = Depends(require_role("admin"))) -> AdminDashboard:
    """Read-only numbers for the admin home. Approvals only cover chat groups the admin is a member of."""
    return await admin_dashboard(user)
