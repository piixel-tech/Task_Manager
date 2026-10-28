import re
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

import anyio

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[2]
CHUNK_SIZE = 1024 * 1024


class FileTooLarge(Exception):
    pass


@dataclass
class StoredFile:
    storage_key: str
    size: int


def safe_filename(name: str | None) -> str:
    """Strip any directory part and unsafe characters from a client-supplied name."""
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[\x00-\x1f<>:\"|?*]", "", base).strip(" .")
    return base[:200] or "file"


class Storage(ABC):
    """Where uploaded bytes live. Implement this to move to S3/R2 later."""

    @abstractmethod
    async def save(self, name: str, source: BinaryIO, max_bytes: int) -> StoredFile:
        """Persist `source` and return its storage key. Raises FileTooLarge past max_bytes."""

    @abstractmethod
    async def delete(self, storage_key: str) -> None: ...

    @abstractmethod
    def get_path(self, storage_key: str) -> Path:
        """Local path to serve the file from. Remote backends can download to a temp file."""


class LocalStorage(Storage):
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    async def save(self, name: str, source: BinaryIO, max_bytes: int) -> StoredFile:
        now = datetime.now(timezone.utc)
        key = f"{now:%Y/%m}/{uuid.uuid4().hex}_{safe_filename(name)}"
        path = self.get_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)

        def write() -> int:
            size = 0
            try:
                with open(path, "wb") as out:
                    while chunk := source.read(CHUNK_SIZE):
                        size += len(chunk)
                        if size > max_bytes:
                            raise FileTooLarge
                        out.write(chunk)
            except BaseException:
                path.unlink(missing_ok=True)
                raise
            return size

        size = await anyio.to_thread.run_sync(write)
        return StoredFile(storage_key=key, size=size)

    async def delete(self, storage_key: str) -> None:
        await anyio.to_thread.run_sync(lambda: self.get_path(storage_key).unlink(missing_ok=True))

    def get_path(self, storage_key: str) -> Path:
        path = (self.root / storage_key).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return path


def _upload_root() -> Path:
    root = Path(settings.UPLOAD_DIR)
    return root if root.is_absolute() else BACKEND_DIR / root


_storage: Storage = LocalStorage(_upload_root())


def get_storage() -> Storage:
    return _storage
