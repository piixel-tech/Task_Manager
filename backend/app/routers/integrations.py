"""Settings > Connected apps: connect / disconnect / sync / choose calendars. Works for any provider in the registry.

Every route only ever touches the signed-in person's own connection; there is no way to address someone else's.
"""
import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.permissions import require
from app.integrations import registry
from app.integrations.base import IntegrationError, Provider, connection_lock
from app.integrations.runner import schedule_sync, sync_connection
from app.models import IntegrationConnection, User
from app.services.notify import notify

router = APIRouter(prefix="/integrations", tags=["integrations"])

STATE_MINUTES = 10
# Connect attempts are serialized per person+app: a double-clicked consent screen must not create two rows.
_connect_locks: dict = defaultdict(asyncio.Lock)


class ConnectionOut(BaseModel):
    status: str
    account: str
    connected_at: datetime
    last_sync_at: datetime | None
    last_error: str | None
    last_error_at: datetime | None
    config: dict


class ProviderOut(BaseModel):
    key: str
    name: str
    description: str
    configured: bool  # false: the server's .env is missing this person's app credentials, so Connect can't work yet
    setup_problem: str | None  # why, e.g. "Google not configured for Piixel"
    extras: dict
    connection: ConnectionOut | None


class ConnectOut(BaseModel):
    auth_url: str


class ConfigIn(BaseModel):
    selected: list[str] | None = Field(default=None, max_length=200)
    write_calendar: str | None = Field(default=None, max_length=300)


class DisconnectOut(BaseModel):
    revoked: bool


def _provider(key: str) -> Provider:
    provider = registry.get(key)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown app")
    return provider


async def _mine(provider: Provider, user: User) -> IntegrationConnection | None:
    return await IntegrationConnection.find_one(
        IntegrationConnection.user_id == user.id, IntegrationConnection.provider == provider.key
    )


def _out(provider: Provider, conn: IntegrationConnection) -> ConnectionOut:
    return ConnectionOut(
        status=conn.status,
        account=conn.account,
        connected_at=conn.created_at,
        last_sync_at=conn.last_sync_at,
        last_error=conn.last_error,
        last_error_at=conn.last_error_at,
        config=provider.public_config(conn),
    )


def _home(user: User | None) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{'/admin' if user and user.role == 'admin' else '/app'}/settings/connected-apps"


@router.get("", response_model=list[ProviderOut])
async def list_apps(user: User = Depends(get_current_user)) -> list[ProviderOut]:
    require(user, "integration.manage")
    mine = {c.provider: c for c in await IntegrationConnection.find(IntegrationConnection.user_id == user.id).to_list()}
    out = []
    for p in registry.all_providers():
        problem = await p.setup_problem(user)
        out.append(
            ProviderOut(
                key=p.key,
                name=p.name,
                description=p.description,
                configured=problem is None,
                setup_problem=problem,
                extras=p.public_extras(),
                connection=_out(p, mine[p.key]) if p.key in mine else None,
            )
        )
    return out


@router.get("/{provider_key}/client-config")
async def client_config(provider_key: str, user: User = Depends(get_current_user)) -> dict:
    """The client ID and API key of the signed-in person's own company (never the secret), so the frontend hardcodes nothing."""
    require(user, "integration.manage")
    return await _provider(provider_key).client_config(user)


@router.post("/{provider_key}/connect", response_model=ConnectOut)
async def connect(provider_key: str, user: User = Depends(get_current_user)) -> ConnectOut:
    """Start OAuth: the browser is sent to the returned address and comes back through the callback below."""
    require(user, "integration.manage")
    provider = _provider(provider_key)
    problem = await provider.setup_problem(user)
    if problem:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, problem)
    now = datetime.now(timezone.utc)
    state = jwt.encode(
        {
            "type": "integration_state", "sub": str(user.id), "app": provider.key,
            "iat": now, "exp": now + timedelta(minutes=STATE_MINUTES),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    try:
        return ConnectOut(auth_url=await provider.authorize_url(user, state))
    except IntegrationError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, exc.message) from exc


@router.get("/{provider_key}/callback", include_in_schema=False)
async def callback(
    provider_key: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    scope: str | None = None,
) -> RedirectResponse:
    """Where Google sends the browser back. No bearer token here: the signed `state` we issued says who it is."""
    provider = registry.get(provider_key)
    user: User | None = None
    try:
        claims = jwt.decode(state or "", settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if claims.get("type") == "integration_state" and provider and claims.get("app") == provider.key:
            user = await User.get(claims["sub"])
    except (jwt.PyJWTError, ValueError):
        pass

    def back(result: str, message: str = "") -> RedirectResponse:
        q = {"app": provider_key, "result": result, **({"message": message[:200]} if message else {})}
        return RedirectResponse(f"{_home(user)}?{urlencode(q)}", status_code=status.HTTP_303_SEE_OTHER)

    if user is None or not user.is_active or provider is None:
        return back("error", "That sign-in link expired. Start again from Settings.")
    if error or not code:
        return back("denied" if error == "access_denied" else "error", "" if error == "access_denied" else (error or "No code from Google"))
    try:
        require(user, "integration.manage")
        async with _connect_locks[(provider.key, user.id)]:
            conn = await provider.complete_connect(user, code, scope)
    except IntegrationError as exc:
        return back("error", exc.message)
    except HTTPException:
        return back("error", "Your account can't connect apps.")
    schedule_sync(conn.id)
    gap = await provider.consent_gap(conn)
    await notify(
        [user.id],
        type="integration_connected",
        title=f"{provider.name} connected",
        body=gap or "Calendar, Meet, Drive, Docs and Sheets are ready. Your calendars will sync in the background.",
        link="/admin/settings/connected-apps" if user.role == "admin" else "/app/settings/connected-apps",
    )
    # Connected, but they unticked part of what we asked for: say so instead of showing a plain success.
    return back("partial", gap) if gap else back("connected")


@router.delete("/{provider_key}", response_model=DisconnectOut)
async def disconnect(provider_key: str, user: User = Depends(get_current_user)) -> DisconnectOut:
    require(user, "integration.manage")
    provider = _provider(provider_key)
    conn = await _mine(provider, user)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{provider.name} isn't connected")
    async with connection_lock(conn.id):
        conn = await _mine(provider, user)
        if conn is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{provider.name} isn't connected")
        revoked = await provider.disconnect(conn)
        await conn.delete()
    await notify(
        [user.id],
        type="integration_disconnected",
        title=f"{provider.name} disconnected",
        body="Access was revoked." if revoked else "We removed it here; remove Task Manager at myaccount.google.com/permissions to finish.",
        link="/admin/settings/connected-apps" if user.role == "admin" else "/app/settings/connected-apps",
    )
    return DisconnectOut(revoked=revoked)


@router.post("/{provider_key}/sync", response_model=ConnectionOut)
async def sync_now(provider_key: str, user: User = Depends(get_current_user)) -> ConnectionOut:
    require(user, "integration.manage")
    provider = _provider(provider_key)
    conn = await _mine(provider, user)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{provider.name} isn't connected")
    if conn.status != "connected":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Reconnect {provider.name} first")
    fresh, _ = await sync_connection(conn.id)
    return _out(provider, fresh or conn)


@router.put("/{provider_key}/config", response_model=ConnectionOut)
async def save_config(provider_key: str, body: ConfigIn, user: User = Depends(get_current_user)) -> ConnectionOut:
    """Which calendars to sync (and which one new events are written to). Syncs right after."""
    require(user, "integration.manage")
    provider = _provider(provider_key)
    conn = await _mine(provider, user)
    if conn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{provider.name} isn't connected")
    async with connection_lock(conn.id):
        conn = await _mine(provider, user)
        if conn is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{provider.name} isn't connected")
        try:
            await provider.update_config(conn, body.model_dump(exclude_none=True))
        except IntegrationError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, exc.message) from exc
    if conn.status == "connected":
        schedule_sync(conn.id)
    return _out(provider, conn)
