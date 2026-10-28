"""Seed companies and the initial admin. Run from backend/: python -m scripts.seed"""
import asyncio

from app.core.config import settings
from app.core.db import close_db, init_db
from app.core.security import hash_password
from app.models import Company, User

COMPANIES = ["Piixel", "Unwork"]


async def main() -> None:
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        raise SystemExit("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env")

    await init_db()
    try:
        companies = {}
        for name in COMPANIES:
            company = await Company.find_one(Company.name == name)
            if company is None:
                company = await Company(name=name).insert()
                print(f"Created company {name}")
            companies[name] = company

        email = settings.ADMIN_EMAIL.lower()
        if await User.find_one(User.email == email) is None:
            await User(
                name="Admin",
                email=email,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                role="admin",
                company_id=companies["Piixel"].id,
            ).insert()
            print(f"Created admin {email}")
        else:
            print(f"Admin {email} already exists")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
