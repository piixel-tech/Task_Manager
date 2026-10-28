import os

# Must happen before `app` is imported: tests run against their own database.
os.environ["DB_NAME"] = "task_manager_test"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123456")
# Integrations: fixed fake credentials, so a developer's real .env can never make a test talk to (or need) real Google.
os.environ["INTEGRATIONS_FERNET_KEY"] = "Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyMTI="
os.environ["GOOGLE_ACMETEST_CLIENT_ID"] = "acme-client-id.apps.googleusercontent.com"
os.environ["GOOGLE_ACMETEST_CLIENT_SECRET"] = "acme-client-secret"
os.environ["GOOGLE_ACMETEST_API_KEY"] = "acme-api-key"
os.environ["GOOGLE_OTHERTEST_CLIENT_ID"] = "other-client-id.apps.googleusercontent.com"
os.environ["GOOGLE_OTHERTEST_CLIENT_SECRET"] = "other-client-secret"
os.environ["GOOGLE_OTHERTEST_API_KEY"] = "other-api-key"
os.environ["GOOGLE_REDIRECT_URI"] = "http://localhost:8000/api/v1/integrations/google/callback"
os.environ["FRONTEND_URL"] = "http://localhost:5173"
os.environ["GOOGLE_PUSH_ENABLED"] = "false"
os.environ["PUBLIC_BASE_URL"] = ""

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db import DOCUMENT_MODELS, close_db, init_db  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

assert settings.DB_NAME.endswith("_test"), "refusing to run tests against a non-test database"


# One event loop and one Mongo connection for the whole run (Motor is bound to its loop,
# and reconnecting to Atlas for every test is slow).
@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _database():
    await init_db()
    yield
    for model in DOCUMENT_MODELS:
        await model.find_all().delete()
    await close_db()


@pytest_asyncio.fixture(autouse=True)
async def db(_database):
    for model in DOCUMENT_MODELS:
        await model.find_all().delete()
    yield


@pytest_asyncio.fixture
async def client(db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


class Person:
    """A user plus ready-made auth headers."""

    def __init__(self, user: User):
        self.user = user
        self.id = str(user.id)
        self.headers = {"Authorization": f"Bearer {create_access_token(self.id)}"}


@pytest.fixture
def make_user():
    async def _make(role: str = "employee", name: str | None = None, **extra) -> Person:
        name = name or f"{role.title()} {os.urandom(2).hex()}"
        user = User(
            name=name,
            email=f"{name.lower().replace(' ', '.')}@example.com",
            password_hash=hash_password("password123"),
            role=role,
            **extra,
        )
        await user.insert()
        return Person(user)

    return _make


@pytest_asyncio.fixture
async def admin(make_user):
    return await make_user("admin", "Ada Admin")


@pytest_asyncio.fixture
async def alice(make_user):
    return await make_user("employee", "Alice Employee")


@pytest_asyncio.fixture
async def bob(make_user):
    return await make_user("employee", "Bob Employee")


@pytest_asyncio.fixture
async def client_user(make_user):
    return await make_user("client", "Cleo Client")
