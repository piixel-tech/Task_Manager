from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _create_token(user_id: str, token_type: str, expires: timedelta, sid: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "type": token_type, "iat": now, "exp": now + expires}
    if sid:
        payload["sid"] = sid  # which sign-in (Session) this token belongs to
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str, sid: str | None = None) -> str:
    return _create_token(user_id, "access", timedelta(minutes=settings.ACCESS_TOKEN_MINUTES), sid)


def create_refresh_token(user_id: str, sid: str | None = None) -> str:
    return _create_token(user_id, "refresh", timedelta(days=settings.REFRESH_TOKEN_DAYS), sid)


def decode_claims(token: str, expected_type: str) -> dict | None:
    """The token's claims if it is valid and of the expected type."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("type") == expected_type else None


def decode_token(token: str, expected_type: str) -> str | None:
    """Return the user id if the token is valid and of the expected type."""
    claims = decode_claims(token, expected_type)
    return claims.get("sub") if claims else None
