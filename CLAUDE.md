# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

In-house task manager for ~15 people across two companies (Piixel, Unwork). `SPEC.md` is the build spec (roles table, features, collections); read it before changing behaviour. `backend/README.md` documents the Google Calendar integration and its `.env` keys.

## Commands

Frontend (repo root, Vite + React 19 + TS, Tailwind v4):

```
npm run dev                      # http://localhost:5173
npm run build                    # tsc -b && vite build
npm run lint                     # oxlint (.oxlintrc.json)
npm test                         # vitest run (jsdom, src/**/*.test.{ts,tsx})
npx vitest run src/features/settings/roleExperience.test.tsx   # one file
npx vitest run -t "client"       # by test name
npx tsc -p tsconfig.app.json --noEmit
```

Backend (`backend/`, FastAPI + Motor + Beanie on MongoDB Atlas, Python 3.12, venv at `backend/.venv`):

```
uvicorn app.main:app --reload --port 8000     # docs at /docs, health at /api/v1/health
.venv\Scripts\python -m pytest                 # all tests
.venv\Scripts\python -m pytest tests/test_user_profile.py::test_name   # one test
python -m scripts.seed                         # seed data
```

Backend tests hit a real Atlas database, `task_manager_test` (`tests/conftest.py` forces `DB_NAME` and asserts it ends in `_test`, and wipes all collections at the end). They are slow because of the network. They use one session-wide event loop (`pytest.ini`), and only Google's HTTP endpoints are mocked (respx). Use the venv Python; the system Python has no pytest.

## Architecture

**Two roles of code, one repo.** The React app is at the root `src/`; the API is in `backend/app/`. All API routes are mounted under `/api/v1` in `app/main.py`; the frontend base URL comes from `VITE_API_URL` (`src/services/api.ts`, axios with token refresh).

**Frontend services are partly real, partly mock.** `src/services/index.ts` chooses implementations: auth, users, projects and tasks use `services/http/*`, while holidays, notifications and gamification still use `services/mock/*`. Most feature screens call a typed `*Api.ts` in `services/http/` directly. Check which one a feature uses before assuming data is persisted.

**Routing and roles.** `src/app/router.tsx` has three areas: `/admin` (AuthGuard + AdminGuard), `/app` (employees) and `/client`, each guarded by role. `src/features/settings/settingsMenu.ts` is the single source of truth for which settings sections each role gets, the per-role base path (`basePath`) and profile links (`profilePath`). `SettingsPage`, `AccountMenu` (the avatar menu, used by `Topbar` and `ClientLayout`) and `PersonLink` all read it, so change it there rather than per page. A section a role lacks redirects to that role's profile section.

**Permissions.** Roles are `admin`, `employee`, `client`. "Head" is not a role, it is per subfolder (`subfolder.head_ids`). Every permission check goes through `can(user, action, subfolder, **context)` / `require(...)` in `backend/app/core/permissions.py`, which encodes the SPEC roles table; routers should not hand-roll role checks. Clients are further limited to their own projects' team (`client_team_ids`).

**Backend layout.** `routers/` (HTTP, thin) → `services/` (business logic) → `models/` (Beanie documents, registered in `core/db.py` `DOCUMENT_MODELS`) with `schemas/` for request/response models. Mutations call `services/notify.py` `notify()`, which stores a notification and pushes it live over the WebSocket (`routers/ws.py`, `services/ws_manager.py`). Background jobs (reminders, Google sync) run from `services/scheduler.py` and are switched off in tests with `SCHEDULER_ENABLED=false`. Deleting goes through a trash/soft-delete flow (`services/trash.py`).

**Integrations (Google Calendar).** `app/integrations/` is a provider registry: subclass `base.Provider`, register it in `integrations/__init__.py`, and the generic `/integrations` routes, the "Connected apps" screen and the sync runner work for it. Google credentials are **per company**: `GOOGLE_<COMPANY>_CLIENT_ID/_CLIENT_SECRET/_API_KEY` in `.env` are chosen by the user's company (`integrations/google/credentials.py`), never mixed, and a connection remembers the company it was made under. Missing keys give "Google not configured for <company>" rather than an error. Tokens are Fernet-encrypted (`INTEGRATIONS_FERNET_KEY`); `GOOGLE_REDIRECT_URI` is the shared OAuth callback. Tests set fake `GOOGLE_ACMETEST_*` keys in `conftest.py` so a real `.env` is never used.

## Conventions (from SPEC.md)

- Every create/edit/delete in the UI: `useConfirm()` dialog before, success toast after, and `notify()` to everyone affected on the backend.
- Write pytest tests per router (separate test DB) and run them.
- Never return `password_hash` from the API. Never commit `.env`.
- Keep the existing UI design (Tailwind with `--tm-*` CSS variables); reuse shared components instead of duplicating them.
- Repo files use CRLF line endings; keep them when editing.

UI redesign in progress: follow DESIGN.md. Never change logic, APIs, state or remove features when doing UI work. Only visual changes, don’t touch logic.

Admin, employee and client share one UI. Every UI change must go into shared components so it applies to all 3 roles.
