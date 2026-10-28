# Task Manager Backend

FastAPI + MongoDB Atlas (Motor + Beanie). Python 3.12.

## Setup

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
```

Edit `.env` and set `MONGO_URL` to your Atlas `mongodb+srv://` string
(and allow your IP in Atlas > Network Access).

## Run

```powershell
uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/api/v1/health -> `{"status":"ok","db":"connected"}`
- Interactive docs: http://localhost:8000/docs

CORS allows the Vite dev server at http://localhost:5173.

## Layout

```
app/
  main.py      app + router wiring, CORS, lifespan
  core/        config (settings), db (Motor/Beanie init)
  models/      Beanie documents
  routers/     API routes (mounted under /api/v1)
  services/    business logic
```

## Connected apps and Google Calendar

Settings > Connected apps lets each person link their own Google account. Everything runs through a small reusable
integrations module, so other apps can plug in later.

### What it does

| Direction | What |
|---|---|
| Google -> Task Manager | Events from the calendars the person ticks (recurring events as their instances) show on their Task Manager calendar. Teammates, admins included, see only "Busy". Busy Google time also blocks booking that person's slots. |
| Task Manager -> Google | The person's bookings (as host or booker) and the due dates of their open tasks become Google events, and follow edits, reassignment, approval and deletion. Task due dates are all-day "free" events, so they never make someone look busy. |
| Sync | Incremental (Google `syncToken`; a full resync happens automatically if Google expires the token). A background job runs every `GOOGLE_SYNC_MINUTES` (default 5) and there is a "Sync now" button. Booking/task changes are pushed immediately. |
| Push notifications | Optional, behind `GOOGLE_PUSH_ENABLED`. Google calls our webhook when a calendar changes, which triggers the same incremental sync. Polling keeps running as a safety net. |

Tokens are stored encrypted (Fernet) and are never sent to the browser. Every route only touches the signed-in person's own
connection and events. "Disconnect" revokes the token at Google, stops push channels and deletes the synced events and links;
events Task Manager already added to the person's Google calendar are left there.

### `.env` keys

```
INTEGRATIONS_FERNET_KEY=   # required. python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Google keys are per company. <COMPANY> is the company's name in upper case ("Piixel" -> PIIXEL, "Un Work" -> UN_WORK).
GOOGLE_PIIXEL_CLIENT_ID=       # from that company's Google Cloud project (below)
GOOGLE_PIIXEL_CLIENT_SECRET=
GOOGLE_PIIXEL_API_KEY=
GOOGLE_UNWORK_CLIENT_ID=
GOOGLE_UNWORK_CLIENT_SECRET=
GOOGLE_UNWORK_API_KEY=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/integrations/google/callback   # must match Google Cloud exactly
FRONTEND_URL=http://localhost:5173    # where the browser lands after Google (Settings > Connected apps)
GOOGLE_SYNC_MINUTES=5
GOOGLE_PUSH_ENABLED=false  # true only with a public HTTPS URL
PUBLIC_BASE_URL=           # e.g. https://tm.example.com (the webhook is PUBLIC_BASE_URL/api/v1/integrations/google/webhook)
```

Each person uses the keys of the company they belong to (Users > company), and a company's keys are never used for anyone else.
A connection remembers the company it was made under, because its tokens only work with that company's client. If a company has
no complete set of keys (client ID, secret and API key) the card says "Google not configured for <company>" and Connect is off;
nothing fails. The frontend gets the right client ID and API key from `GET /api/v1/integrations/google/client-config` (the secret
is never sent). All companies share the one `GOOGLE_REDIRECT_URI`, so register it in each company's Google Cloud project.

Keep `INTEGRATIONS_FERNET_KEY` safe and backed up: if it is lost, stored tokens can't be read and everyone has to reconnect.
To rotate it, put the new key first and keep the old one after a comma (`NEW,OLD`); new tokens use the first key, old ones still decrypt.
Never commit `.env`.

### Google Cloud setup (once)

Do this once per company (Piixel, Unwork), each in its own Google Cloud project, and fill that company's three `.env` keys.

1. Open <https://console.cloud.google.com/> and create (or pick) the company's project.
2. **APIs & Services > Library**: enable **Google Calendar API**.
3. **APIs & Services > OAuth consent screen** (Google Auth Platform):
   - User type **Internal** if everyone is on one Google Workspace (no review needed). Otherwise **External**; while it is in
     *Testing* add each person under **Test users** (refresh tokens of Testing apps expire after 7 days, so publish the app to
     *In production* for real use).
   - Add these scopes: `https://www.googleapis.com/auth/calendar.events` and
     `https://www.googleapis.com/auth/calendar.calendarlist.readonly`.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**, type **Web application**:
   - Authorized redirect URI: the value of `GOOGLE_REDIRECT_URI` (for local development
     `http://localhost:8000/api/v1/integrations/google/callback`; in production your HTTPS API address).
5. **Credentials > Create credentials > API key** (restrict it to the Google Calendar API). Copy the client ID, secret and API key
   into the company's `GOOGLE_<COMPANY>_*` keys in `.env`, add a Fernet key, restart the API.
6. Sign in to Task Manager, open **Settings > Connected apps > Connect Google Calendar**.

Push notifications (optional): the API needs a public HTTPS address, and its domain must be verified under **APIs & Services >
Domain verification** in the same project. Then set `GOOGLE_PUSH_ENABLED=true` and `PUBLIC_BASE_URL`. If Google refuses the
webhook the card shows why and polling continues. Channels last about 6 days and renew automatically.

### Adding another app

1. Subclass `app.integrations.base.Provider` (OAuth URL, `complete_connect`, `sync`, `disconnect`, `public_config`, `update_config`;
   optionally `push_local_changes`). Use `app.integrations.crypto` for tokens.
2. Register it in `app/integrations/__init__.py`: `registry.register(MyProvider())`.

The generic `/integrations` routes, the "Connected apps" screen, the connections collection (`integration_connections`), the
background job and error handling (reconnect notice, last error) then work for it unchanged. Collections used:
`integration_connections` (encrypted tokens + provider config), `external_events` (pulled events, private to the owner) and
`integration_links` (which booking/task is which remote event).

### Tests

```powershell
pytest tests/test_google_integration.py
```

Only Google's HTTP endpoints are mocked (with `respx`); the API, database, encryption and sync code are real.
