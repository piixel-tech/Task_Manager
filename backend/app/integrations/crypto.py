"""Encryption at rest for third-party tokens (Fernet; INTEGRATIONS_FERNET_KEY in .env)."""
from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import settings


class CryptoError(RuntimeError):
    """The key is missing or wrong; the message says what to fix and never contains a secret."""


def _fernet() -> MultiFernet:
    keys = [k.strip() for k in settings.INTEGRATIONS_FERNET_KEY.split(",") if k.strip()]
    if not keys:
        raise CryptoError("INTEGRATIONS_FERNET_KEY is not set in .env")
    try:
        return MultiFernet([Fernet(k.encode()) for k in keys])
    except ValueError as exc:
        raise CryptoError("INTEGRATIONS_FERNET_KEY is not a valid Fernet key") from exc


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except InvalidToken as exc:
        raise CryptoError("A stored token can't be decrypted with INTEGRATIONS_FERNET_KEY") from exc


def key_is_valid() -> bool:
    try:
        _fernet()
        return True
    except CryptoError:
        return False
