import asyncio
from collections import defaultdict
from typing import Any, Iterable

from beanie import PydanticObjectId
from fastapi import WebSocket


class ConnectionManager:
    """Tracks open WebSockets per user; one user may have several (tabs/devices)."""

    def __init__(self) -> None:
        self._connections: dict[PydanticObjectId, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: PydanticObjectId, ws: WebSocket) -> None:
        self._connections[user_id].add(ws)

    def disconnect(self, user_id: PydanticObjectId, ws: WebSocket) -> None:
        sockets = self._connections.get(user_id)
        if sockets is None:
            return
        sockets.discard(ws)
        if not sockets:
            del self._connections[user_id]

    async def disconnect_user(self, user_id: PydanticObjectId) -> None:
        """Close every open socket of this person (after their sign-in was revoked)."""
        for ws in list(self._connections.get(user_id, ())):
            try:
                await ws.close(code=4401, reason="Signed out")
            except Exception:
                pass
            self.disconnect(user_id, ws)

    def is_online(self, user_id: PydanticObjectId) -> bool:
        return bool(self._connections.get(user_id))

    async def _send(self, user_id: PydanticObjectId, ws: WebSocket, message: dict[str, Any]) -> None:
        try:
            await ws.send_json(message)
        except Exception:
            # Dead socket: drop it; the receive loop will also notice.
            self.disconnect(user_id, ws)

    async def send_to_users(self, user_ids: Iterable[PydanticObjectId], event: str, data: Any) -> None:
        message = {"event": event, "data": data}
        tasks = [
            self._send(uid, ws, message)
            for uid in set(user_ids)
            for ws in list(self._connections.get(uid, ()))
        ]
        if tasks:
            await asyncio.gather(*tasks)


manager = ConnectionManager()
