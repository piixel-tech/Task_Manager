"""What every third-party app must provide to plug into Settings > Connected apps.

A provider is a singleton registered in `app.integrations.registry`. The generic router handles the parts every app shares
(connect, callback, disconnect, status, sync now); a provider adds only what is specific to the app. To add another app:
subclass `Provider`, implement the abstract methods, and `register()` it in `app/integrations/__init__.py`.
"""
import asyncio
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass

from beanie import PydanticObjectId

from app.models import IntegrationConnection, User


class IntegrationError(Exception):
    """Something the person should hear about. `reconnect` means the stored login no longer works."""

    def __init__(self, message: str, *, reconnect: bool = False):
        super().__init__(message)
        self.message = message
        self.reconnect = reconnect


@dataclass
class SyncResult:
    pulled: int = 0  # events added/changed/removed on our side
    pushed: int = 0  # events created/updated/removed on theirs

    @property
    def changed(self) -> bool:
        return bool(self.pulled or self.pushed)


# One lock per connection so a background sync, "Sync now" and a webhook can't edit the same sync state at once.
# (Single-process guard, like the booking locks; use a DB lease if the API ever runs on several workers.)
_locks: dict[PydanticObjectId, asyncio.Lock] = defaultdict(asyncio.Lock)


def connection_lock(connection_id: PydanticObjectId) -> asyncio.Lock:
    return _locks[connection_id]


class Provider(ABC):
    key: str  # url-safe id, also the value stored in `IntegrationConnection.provider`
    name: str
    description: str

    @abstractmethod
    async def setup_problem(self, user: User) -> str | None:
        """Why this person can't connect yet (e.g. keys missing in .env), in words they can read; None when ready."""

    async def client_config(self, user: User) -> dict:
        """What the browser may know about the app credentials that apply to this person (never a secret)."""
        return {}

    @abstractmethod
    async def authorize_url(self, user: User, state: str) -> str: ...

    @abstractmethod
    async def complete_connect(self, user: User, code: str, granted_scope: str | None) -> IntegrationConnection:
        """Trade the OAuth code for tokens and store the (encrypted) connection. Raises IntegrationError."""

    @abstractmethod
    async def sync(self, connection: IntegrationConnection) -> SyncResult:
        """One full cycle, both directions. Called under the connection lock. Raises IntegrationError."""

    @abstractmethod
    async def disconnect(self, connection: IntegrationConnection) -> bool:
        """Revoke the token with the app and delete everything we hold for this connection. True if the app confirmed the revoke."""

    @abstractmethod
    def public_config(self, connection: IntegrationConnection) -> dict:
        """What the UI may see of `connection.config` (never tokens)."""

    @abstractmethod
    async def update_config(self, connection: IntegrationConnection, data: dict) -> None:
        """Apply the person's choices (e.g. which calendars to sync). Raises IntegrationError for bad input."""

    async def push_local_changes(self, connection: IntegrationConnection) -> int:
        """Send our bookings/tasks to the app. Called under the connection lock. Default: nothing to send."""
        return 0

    def public_extras(self) -> dict:
        """App-level facts for the UI (e.g. whether push notifications are available)."""
        return {}
