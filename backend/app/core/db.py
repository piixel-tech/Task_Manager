from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models import Booking, ChatGroup, ChatMessage, ChecklistItem, ClientApproval, Company, DailyStatus, DeliverablePlan, ExternalEvent, File, IntegrationConnection, IntegrationLink, Invite, MonthlyReport, Notification, OfficePost, Project, Requirement, ScheduledMessage, Subfolder, Task, TaskActivity, TaskReview, TimeLog, TrashItem, User, Workspace
from app.models import Session

client: AsyncIOMotorClient | None = None

# Register Beanie document classes here as models are added.
DOCUMENT_MODELS: list = [Booking, ChatGroup, ChatMessage, ChecklistItem, ClientApproval, Company, DailyStatus, DeliverablePlan, ExternalEvent, File, IntegrationConnection, IntegrationLink, Invite, MonthlyReport, Notification, OfficePost, Project, Requirement, ScheduledMessage, Subfolder, Task, TaskActivity, TaskReview, TimeLog, TrashItem, User, Workspace, Session]


async def init_db() -> None:
    global client
    client = AsyncIOMotorClient(settings.MONGO_URL)
    await init_beanie(database=client[settings.DB_NAME], document_models=DOCUMENT_MODELS)
    await migrate_subfolders()


async def migrate_subfolders() -> None:
    """Subfolders made before visibility existed become private, and every subfolder carries its project's companies. Safe to run on every start."""
    from app.models.project import Project, Subfolder

    await Subfolder.get_motor_collection().update_many({"visibility": {"$exists": False}}, {"$set": {"visibility": "private"}})
    async for project in Project.find({}):
        companies = list(dict.fromkeys([project.company_id, *project.extra_company_ids]))
        await Subfolder.get_motor_collection().update_many(
            {"project_id": project.id, "$or": [{"company_ids": {"$exists": False}}, {"company_ids": {"$ne": companies}}]}, {"$set": {"company_ids": companies}}
        )


async def close_db() -> None:
    if client is not None:
        client.close()


async def ping_db() -> None:
    assert client is not None
    await client.admin.command("ping")
