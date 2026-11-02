from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import close_db, init_db
from app.services.scheduler import start_scheduler, stop_scheduler
from app.routers import activity, approvals, auth, bookings, chat, chat_extras, checklist, companies, daily_status, dashboard, deliverables, export, external_events, files, festival, focus, health, integrations, integrations_google, invites, me, notifications, office, portal, projects, requirements, reviews, security, sidebar, subfolders, tasks, themes, trash, users, workspace, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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
api_v1.include_router(daily_status.router)
api_v1.include_router(bookings.router)
api_v1.include_router(dashboard.router)
api_v1.include_router(integrations_google.router)
api_v1.include_router(integrations.router)
api_v1.include_router(external_events.router)
api_v1.include_router(projects.router)
api_v1.include_router(subfolders.router)
api_v1.include_router(sidebar.router)
api_v1.include_router(tasks.router)
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
