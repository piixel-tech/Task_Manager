import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import close_db, init_db
from app.integrations.google import credentials as google_credentials
from app.models import Company
from app.services.scheduler import start_scheduler, stop_scheduler
from app.routers import activity, approvals, auth, bookings, chat, chat_extras, checklist, companies, daily_status, dashboard, deliverables, export, external_events, files, google_workspace, festival, focus, health, integrations, integrations_google, invites, leave_requests, me, notifications, office, portal, projects, push, reports, requirements, reviews, security, sidebar, subfolders, tasks, themes, timer, trash, users, workspace, ws


log = logging.getLogger(__name__)


async def warn_about_google_config() -> None:
    """Say at startup which Google .env keys are missing, so 'Google not configured' is never a mystery. Never blocks startup."""
    try:
        names = [c.name for c in await Company.find_all().to_list()]
        names = list(dict.fromkeys(names or ["Piixel", "Unwork"]))
        for line in google_credentials.config_warnings(names):
            log.warning("Google integration: %s (see backend/.env.example)", line)
    except Exception:
        log.exception("Could not check the Google configuration")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await warn_about_google_config()
    start_scheduler()
    yield
    stop_scheduler()
    await close_db()


app = FastAPI(title="Task Manager API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(health.router)
api_v1.include_router(auth.router)
api_v1.include_router(users.router)
api_v1.include_router(me.router)
api_v1.include_router(workspace.router)
api_v1.include_router(festival.router)
api_v1.include_router(themes.router)
api_v1.include_router(security.router)
api_v1.include_router(trash.router)
api_v1.include_router(export.router)
api_v1.include_router(companies.router)
api_v1.include_router(files.router)
api_v1.include_router(notifications.router)
api_v1.include_router(leave_requests.router)
api_v1.include_router(push.router)
api_v1.include_router(daily_status.router)
api_v1.include_router(bookings.router)
api_v1.include_router(dashboard.router)
api_v1.include_router(integrations_google.router)
api_v1.include_router(google_workspace.router)
api_v1.include_router(integrations.router)
api_v1.include_router(external_events.router)
api_v1.include_router(projects.router)
api_v1.include_router(subfolders.router)
api_v1.include_router(sidebar.router)
api_v1.include_router(tasks.router)
api_v1.include_router(timer.router)
api_v1.include_router(reports.router)
api_v1.include_router(reviews.router)
api_v1.include_router(checklist.router)
api_v1.include_router(deliverables.router)
api_v1.include_router(office.router)
api_v1.include_router(activity.router)
api_v1.include_router(chat.router)
api_v1.include_router(chat_extras.router)
api_v1.include_router(focus.router)
api_v1.include_router(approvals.router)
api_v1.include_router(invites.router)
api_v1.include_router(requirements.router)
api_v1.include_router(portal.router)
api_v1.include_router(ws.router)
app.include_router(api_v1)
