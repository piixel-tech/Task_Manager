from fastapi import APIRouter, HTTPException

from app.core.db import ping_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    try:
        await ping_db()
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "error", "db": "disconnected"})
    return {"status": "ok", "db": "connected"}
