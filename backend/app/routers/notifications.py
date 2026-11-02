from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.models import Notification, User
from app.schemas.notification import (
    MarkRead,
    MarkReadResult,
    NotificationOut,
    NotificationPage,
    TestNotification,
    UnreadCount,
)
from app.services.notify import notify, outs_with_actors

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPage)
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
) -> NotificationPage:
    query = Notification.find(Notification.user_id == user.id)
    if unread_only:
        query = query.find(Notification.read == False)  # noqa: E712 (Beanie expression)
    total = await query.count()
    items = await query.sort("-created_at").skip(skip).limit(limit).to_list()
    out = await outs_with_actors(items)
    return NotificationPage(items=out, total=total, limit=limit, skip=skip)


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(user: User = Depends(get_current_user)) -> UnreadCount:
    count = await Notification.find(
        Notification.user_id == user.id, Notification.read == False  # noqa: E712
    ).count()
    return UnreadCount(count=count)


@router.post("/read", response_model=MarkReadResult)
async def mark_read(body: MarkRead, user: User = Depends(get_current_user)) -> MarkReadResult:
    if not body.all and not body.ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Provide ids or set all=true")
    query = Notification.find(Notification.user_id == user.id, Notification.read == False)  # noqa: E712
    if not body.all:
        query = query.find({"_id": {"$in": body.ids}})
    result = await query.update({"$set": {"read": True}})
    return MarkReadResult(updated=result.modified_count if result else 0)


if settings.ENVIRONMENT == "development":

    @router.post("/test", response_model=NotificationOut, status_code=status.HTTP_201_CREATED)
    async def send_test_notification(
        body: TestNotification, admin: User = Depends(require_role("admin"))
    ):
        """Dev only: push a test notification to any user."""
        if await User.get(body.user_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        docs = await notify(
            [body.user_id], "test", body.title, body.body, body.link, actor_id=admin.id
        )
        return docs[0]
