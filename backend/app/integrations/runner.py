"""Running providers: one sync cycle for a connection, the background job, and fire-and-forget pushes after local changes."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Iterable

from beanie import PydanticObjectId

from app.integrations import registry
from app.integrations.base import IntegrationError, SyncResult, connection_lock
from app.models import IntegrationConnection
from app.services.notify import notify
from app.services.ws_manager import manager

log = logging.getLogger(__name__)
_pending: set[asyncio.Task] = set()


async def sync_connection(connection_id: PydanticObjectId) -> tuple[IntegrationConnection | None, SyncResult]:
    """Pull then push for one connection, recording success or the error. Never raises for provider failures."""
    result = SyncResult()
    async with connection_lock(connection_id):
        conn = await IntegrationConnection.get(connection_id)  # fresh copy: another cycle may have just saved sync tokens
        provider = registry.get(conn.provider) if conn else None
        if conn is None or provider is None or conn.status != "connected":
            return conn, result
        try:
            result = await provider.sync(conn)
            conn = await IntegrationConnection.get(connection_id) or conn
            conn.last_sync_at = datetime.now(timezone.utc)
            conn.last_error = None
            conn.last_error_at = None
            conn.error_notified = False
            await conn.save()
        except IntegrationError as exc:
            await _record_failure(connection_id, provider.name, exc)
            conn = await IntegrationConnection.get(connection_id)
        except Exception:
            log.exception("%s sync crashed for connection %s", provider.key, connection_id)
            await _record_failure(connection_id, provider.name, IntegrationError("Unexpected error while syncing"))
            conn = await IntegrationConnection.get(connection_id)
    if conn is not None and result.pulled:
        await manager.send_to_users([conn.user_id], "calendar_sync", {"provider": conn.provider})
    return conn, result


async def _record_failure(connection_id: PydanticObjectId, name: str, exc: IntegrationError) -> None:
    conn = await IntegrationConnection.get(connection_id)
    if conn is None:
        return
    conn.last_error = exc.message[:300]
    conn.last_error_at = datetime.now(timezone.utc)
    if exc.reconnect:
        conn.status = "needs_reconnect"
    # Transient errors only show on the card; a login that no longer works needs the person, once.
    tell = exc.reconnect and not conn.error_notified
    if tell:
        conn.error_notified = True
    await conn.save()
    if tell:
        await notify(
            [conn.user_id],
            type="integration_error",
            title=f"Reconnect {name}",
            body=f"{exc.message} Open Settings > Connected apps to reconnect.",
            link="/app/settings/connected-apps",
        )


async def run_integration_sync() -> int:
    """The scheduled job: every healthy connection, one after another so a slow app can't pile up requests."""
    ids = [c.id for c in await IntegrationConnection.find({"status": "connected"}).to_list()]
    for connection_id in ids:
        await sync_connection(connection_id)
    return len(ids)


def schedule_push(user_ids: Iterable[PydanticObjectId]) -> None:
    """After a booking/task change: send it to each person's connected apps without slowing the request down.

    Best effort. If it fails (or the person has nothing connected) the next scheduled sync reconciles everything anyway.
    """
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return
    task = asyncio.get_running_loop().create_task(_push(ids))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


def schedule_sync(connection_id: PydanticObjectId) -> None:
    """A full sync in the background (right after connecting, or when a webhook says something changed)."""
    task = asyncio.get_running_loop().create_task(sync_connection(connection_id))
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def _push(user_ids: list[PydanticObjectId]) -> None:
    try:
        conns = await IntegrationConnection.find({"user_id": {"$in": user_ids}, "status": "connected"}).to_list()
        for conn in conns:
            provider = registry.get(conn.provider)
            if provider is None:
                continue
            async with connection_lock(conn.id):
                fresh = await IntegrationConnection.get(conn.id)
                if fresh is None or fresh.status != "connected":
                    continue
                try:
                    await provider.push_local_changes(fresh)
                except IntegrationError as exc:
                    await _record_failure(fresh.id, provider.name, exc)
    except Exception:
        log.exception("Pushing local changes failed")


async def wait_for_pushes() -> None:
    """Let in-flight pushes finish (used by tests)."""
    while _pending:
        await asyncio.gather(*list(_pending), return_exceptions=True)
