from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MONGO_URL: str
    DB_NAME: str = "task_manager"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 30
    REFRESH_TOKEN_DAYS: int = 7

    TIMEZONE: str = "Asia/Kolkata"  # what "today" means for daily status
    SCHEDULER_ENABLED: bool = True
    WORK_START_HOUR: int = 9  # local hours (TIMEZONE) that count as bookable
    WORK_END_HOUR: int = 18
    REMINDER_HOUR: int = 9  # local hour (TIMEZONE) when the daily task reminders go out
    ENVIRONMENT: str = "development"  # dev-only routes are disabled for anything else

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 25

    # --- Integrations (see backend/README.md > Google Calendar) ---
    # Fernet key(s) that encrypt third-party tokens at rest. Comma-separated: the first encrypts, all can decrypt (key rotation).
    # Generate one with:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    INTEGRATIONS_FERNET_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:5173"  # where the OAuth callback sends the browser back to
    # Google keys are per company, GOOGLE_<COMPANY>_CLIENT_ID / _CLIENT_SECRET / _API_KEY (see integrations/google/credentials.py).
    # Must match an "Authorized redirect URI" in Google Cloud exactly.
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/integrations/google/callback"
    GOOGLE_SYNC_MINUTES: int = 5
    # Google push notifications: needs a public HTTPS URL for this API (no localhost). Off by default; polling keeps working either way.
    GOOGLE_PUSH_ENABLED: bool = False
    PUBLIC_BASE_URL: str = ""  # e.g. https://tm.example.com  (the webhook is PUBLIC_BASE_URL/api/v1/integrations/google/webhook)

    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None


settings = Settings()
