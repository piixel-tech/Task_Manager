"""Google credentials are per company (Piixel and Unwork are separate Google Cloud apps), read from .env as
GOOGLE_<COMPANY>_CLIENT_ID / _CLIENT_SECRET / _API_KEY, e.g. GOOGLE_PIIXEL_CLIENT_ID. A person always uses the keys of their own
company and nothing falls back to another company's. The redirect URI is the one shared GOOGLE_REDIRECT_URI.
"""
import os
import re
from dataclasses import dataclass

from dotenv import dotenv_values

from app.core.config import settings
from app.models import Company, IntegrationConnection, User


class NotConfigured(Exception):
    """The company has no (complete) Google keys in .env. The message is safe to show to the person."""


@dataclass(frozen=True)
class GoogleCredentials:
    company: str
    client_id: str
    client_secret: str
    api_key: str


def env_prefix(company: str) -> str:
    """'Piixel' -> 'GOOGLE_PIIXEL_', 'Un work Ltd' -> 'GOOGLE_UN_WORK_LTD_'."""
    return f"GOOGLE_{re.sub(r'[^A-Z0-9]+', '_', company.upper()).strip('_')}_"


def _env(name: str) -> str:
    value = os.environ.get(name)
    if value is None:  # pydantic-settings reads .env without exporting it, and these names are not declared fields
        value = dotenv_values(settings.model_config.get("env_file") or ".env").get(name)
    return (value or "").strip()


def for_company(company: str) -> GoogleCredentials:
    prefix = env_prefix(company)
    creds = GoogleCredentials(company, _env(prefix + "CLIENT_ID"), _env(prefix + "CLIENT_SECRET"), _env(prefix + "API_KEY"))
    if not (creds.client_id and creds.client_secret and creds.api_key):
        raise NotConfigured(f"Google not configured for {company}")
    return creds


def config_warnings(companies: list[str]) -> list[str]:
    """What is missing from .env for Google to work, one readable line each (empty when everything is set)."""
    from app.integrations import crypto  # local import: crypto only needs settings, but keep this module's imports light

    warnings: list[str] = []
    if not crypto.key_is_valid():
        warnings.append("INTEGRATIONS_FERNET_KEY is missing or invalid, so nobody can connect Google")
    if not (settings.GOOGLE_REDIRECT_URI or "").strip():
        warnings.append("GOOGLE_REDIRECT_URI is empty")
    for company in companies:
        prefix = env_prefix(company)
        missing = [prefix + k for k in ("CLIENT_ID", "CLIENT_SECRET", "API_KEY") if not _env(prefix + k)]
        if missing:
            warnings.append(f"Google is not configured for {company}: set {', '.join(missing)}")
    return warnings


async def company_name(user: User) -> str:
    company = await Company.get(user.company_id) if user.company_id else None
    if company is None:
        raise NotConfigured("Google not configured: your account isn't assigned to a company")
    return company.name


async def for_user(user: User) -> GoogleCredentials:
    return for_company(await company_name(user))


async def for_connection(conn: IntegrationConnection, user: User | None = None) -> GoogleCredentials:
    """Tokens only work with the client that issued them, so a connection sticks to the company it was made under."""
    saved = conn.config.get("company")
    if saved:
        return for_company(saved)
    user = user or await User.get(conn.user_id)
    if user is None:
        raise NotConfigured("Google not configured: the account no longer exists")
    return await for_user(user)
