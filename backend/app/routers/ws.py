import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.deps import user_for_token
from app.models import User
from app.services import chat as chat_service
from app.services.ws_manager import manager

router = APIRouter(tags=["websocket"])

PING_INTERVAL = 30  # seconds of silence before we ping
MAX_MISSED_PINGS = 2  # close after this many unanswered pings
UNAUTHORIZED = 4401


async def _user_from_token(token: str | None) -> User | None:
    found = await user_for_token(token)
    return found[0] if found else None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None) -> None:
    await websocket.accept()
    user = await _user_from_token(token)
    if user is None:
        await websocket.close(code=UNAUTHORIZED, reason="Invalid or expired token")
        return

    manager.connect(user.id, websocket)
    await websocket.send_json({"event": "connected", "data": {"user_id": str(user.id)}})
    try:
        await chat_service.on_connect(user)  # messages waiting for this device are now delivered
    except Exception:
        pass  # chat bookkeeping must never stop the socket
    missed = 0
    try:
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=PING_INTERVAL)
            except asyncio.TimeoutError:
                missed += 1
                if missed > MAX_MISSED_PINGS:
                    await websocket.close(code=1001, reason="Ping timeout")
                    return
                await websocket.send_json({"event": "ping", "data": None})
                continue
            except ValueError:
                continue  # ignore non-JSON frames
            missed = 0  # any traffic proves the client is alive
            if not isinstance(message, dict):
                continue
            if message.get("event") == "ping":
                await websocket.send_json({"event": "pong", "data": None})
            elif message.get("event") == "typing":
                data = message.get("data")
                try:
                    await chat_service.typing(user, data.get("group_id") if isinstance(data, dict) else None)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user.id, websocket)
