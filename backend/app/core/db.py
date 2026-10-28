from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models import Booking, ChatGroup, ChatMessage, ChecklistItem, ClientApproval, Company, DailyStatus, DeliverablePlan, ExternalEvent, File, IntegrationConnection, IntegrationLink, Invite, Notification, OfficePost, Project, Requirement, ScheduledMessage, Subfolder, Task, TaskActivity, TaskReview, TimeLog, TrashItem, User, Workspace
from app.models import Session

client: AsyncIOMotorClient | None = None

# Register Beanie document classes here as models are added.
DOCUMENT_MODELS: list = [Booking, ChatGroup, ChatMessage, ChecklistItem, ClientApproval, Company, DailyStatus, DeliverablePlan, ExternalEvent, File, IntegrationConnection, IntegrationLink, Invite, Notification, OfficePost, Project, Requirement, ScheduledMessage, Subfolder, Task, TaskActivity, TaskReview, TimeLog, TrashItem, User, Workspace, Session]


async def init_db() -> None:
    global client
    client = AsyncIOMotorClient(settings.MONGO_URL)
    await init_beanie(database=client[settings.DB_NAME], document_models=DOCUMENT_MODELS)


async def close_db() -> None:
    if client is not None:
        client.close()


async def ping_db() -> None:
    assert client is not None
    await client.admin.command("ping")
