"""Web Push: the notification reaches the person's browser even when Task Manager is not open.

`notify()` calls `schedule_push()` for everyone who should get a system notification. Sending is best effort and never
slows down or breaks the request that caused it. A subscription the push service says is gone (404/410) is deleted.
"""
import asyncio
import json
import logging
from typing import Iterable

from beanie import PydanticObjectId
from pywebpush import WebPushException, webpush

from app.core.config import settings
from app.models import PushSubscription
from app.services.ws_manager import manager

log = logging.getLogger(__name__)
_pending: set[asyncio.Task] = set()
GONE = (404, 410)


def is_configured() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY.strip() and settings.VAPID_PRIVATE_KEY.strip())


def _send_one(sub: PushSubscription, payload: str) -> int | None:
    """Blocking (run in a thread). Returns the push service's HTTP status when it refused, None on success."""
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY.strip(),
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=24 * 3600,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status not in GONE:
            log.warning("Web Push to %s failed: %s", sub.endpoint[:60], exc)
        return status or 0
    except Exception:
        log.exception("Web Push crashed for %s", sub.endpoint[:60])
        return 0
    return None


async def send_push(user_ids: Iterable[PydanticObjectId], payload: dict) -> int:
    """Send `payload` to every subscription of these people. Returns how many were delivered."""
    if not is_configured():
        return 0
    ids = list(dict.fromkeys(user_ids))
    subs = await PushSubscription.find({"user_id": {"$in": ids}}).to_list() if ids else []
    if not subs:
        return 0
    body = json.dumps(payload)
    results = await asyncio.gather(*(asyncio.to_thread(_send_one, s, body) for s in subs))
    gone = [s.id for s, status in zip(subs, results) if status in GONE]
    if gone:  # the browser unsubscribed or the subscription expired: stop trying
        await PushSubscription.find({"_id": {"$in": gone}}).delete()
    return sum(1 for status in results if status is None)


def schedule_push(user_ids: Iterable[PydanticObjectId], payload: dict) -> None:
    """Fire and forget. People with the app open (a live WebSocket) already get the in-app toast, so they are skipped here."""
    if not is_configured():
        return
    offline = [uid for uid in dict.fromkeys(user_ids) if not manager.is_online(uid)]
    if not offline:
        return
    task = asyncio.get_running_loop().create_task(_safe_send(offline, payload))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def _safe_send(user_ids: list[PydanticObjectId], payload: dict) -> None:
    try:
        await send_push(user_ids, payload)
    except Exception:
        log.exception("Sending Web Push failed")


async def wait_for_pushes() -> None:
    """Let in-flight pushes finish (used by tests)."""
    while _pending:
        await asyncio.gather(*list(_pending), return_exceptions=True)
