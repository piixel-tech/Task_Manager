from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models import Booking, ChatGroup, ChatMessage, ChecklistItem, ClientApproval, Company, DailyStatus, DeliverablePlan, ExternalEvent, File, IntegrationConnection, IntegrationLink, Invite, LeaveRequest, MonthlyReport, Notification, OfficePost, Project, PushSubscription, Requirement, ScheduledMessage, Subfolder, Task, TaskActivity, TaskReview, TimeLog, TrashItem, User, Workspace
from app.models import Session

client: AsyncIOMotorClient | None = None

# Register Beanie document classes here as models are added.
DOCUMENT_MODELS: list = [Booking, ChatGroup, ChatMessage, ChecklistItem, ClientApproval, Company, DailyStatus, DeliverablePlan, ExternalEvent, File, IntegrationConnection, IntegrationLink, Invite, LeaveRequest, MonthlyReport, Notification, OfficePost, Project, PushSubscription, Requirement, ScheduledMessage, Subfolder, Task, TaskActivity, TaskReview, TimeLog, TrashItem, User, Workspace, Session]


async def init_db() -> None:
    global client
    client = AsyncIOMotorClient(settings.MONGO_URL)
    await init_beanie(database=client[settings.DB_NAME], document_models=DOCUMENT_MODELS)
    await migrate_subfolders()


async def migrate_subfolders() -> None:
    """Visibility moves to hidden / everyone / selected (old: private -> hidden; company, read-only and open -> everyone), and every subfolder
    carries its project's companies. Safe to run on every start."""
    from app.models.project import Project, Subfolder

    coll = Subfolder.get_motor_collection()
    await coll.update_many({"visibility": {"$exists": False}}, {"$set": {"visibility": "hidden"}})
    await coll.update_many({"visibility": "private"}, {"$set": {"visibility": "hidden"}})
    await coll.update_many({"visibility": {"$in": ["view_only", "read_only", "open"]}}, {"$set": {"visibility": "everyone"}})
    await coll.update_many({"viewer_ids": {"$exists": False}}, {"$set": {"viewer_ids": []}})
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
