from datetime import time

from fastapi import HTTPException, status

from app.core.config import settings
from app.models import Workspace


async def get_workspace() -> Workspace:
    """The single settings record, created on first use."""
    ws = await Workspace.find_one()
    if ws is None:
        ws = await Workspace(work_start=f"{settings.WORK_START_HOUR:02d}:00", work_end=f"{settings.WORK_END_HOUR:02d}:00").insert()
    return ws


def parse_clock(value: str) -> time:
    try:
        h, m = value.split(":")
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Use a time like 09:30")
