import mimetypes
from pathlib import PurePath

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi import File as FormFile
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import get_current_user
from app.models import File, User
from app.schemas.file import FileOut, LinkCreate
from app.services.storage import FileTooLarge, Storage, get_storage, safe_filename

router = APIRouter(prefix="/files", tags=["files"], dependencies=[Depends(get_current_user)])

BLOCKED_EXTENSIONS = {".exe", ".bat", ".sh", ".msi"}


async def _get_or_404(file_id: PydanticObjectId) -> File:
    file = await File.get(file_id)
    if file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return file


@router.post("", response_model=list[FileOut], status_code=status.HTTP_201_CREATED)
async def upload_files(
    files: list[UploadFile] = FormFile(...),
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> list[File]:
    names = [safe_filename(f.filename) for f in files]
    for name in names:
        if PurePath(name).suffix.lower() in BLOCKED_EXTENSIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File type not allowed: {name}")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    saved: list[File] = []
    try:
        for upload, name in zip(files, names):
            try:
                stored = await storage.save(name, upload.file, max_bytes)
            except FileTooLarge:
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    f"{name} exceeds the {settings.MAX_UPLOAD_MB} MB limit",
                )
            mime = upload.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
            record = File(
                owner_id=user.id,
                name=name,
                mime=mime,
                size=stored.size,
                kind="upload",
                storage_key=stored.storage_key,
                url="",
            )
            await record.insert()
            record.url = f"/api/v1/files/{record.id}/download"
            await record.save()
            saved.append(record)
    except BaseException:
        # All-or-nothing: don't leave half a batch behind.
        for record in saved:
            await storage.delete(record.storage_key)
            await record.delete()
        raise
    return saved


@router.post("/link", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def create_link(body: LinkCreate, user: User = Depends(get_current_user)) -> File:
    record = File(
        owner_id=user.id,
        name=body.title.strip(),
        mime="text/uri-list",
        size=0,
        kind="link",
        url=str(body.url),
    )
    await record.insert()
    return record


@router.get("/{file_id}", response_model=FileOut)
async def get_file(file_id: PydanticObjectId) -> File:
    return await _get_or_404(file_id)


@router.get("/{file_id}/download")
async def download_file(
    file_id: PydanticObjectId, storage: Storage = Depends(get_storage)
) -> FileResponse:
    file = await _get_or_404(file_id)
    if file.kind != "upload" or not file.storage_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Links have nothing to download")
    path = storage.get_path(file.storage_key)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File is missing from storage")
    return FileResponse(path, media_type=file.mime, filename=file.name)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: PydanticObjectId,
    user: User = Depends(get_current_user),
    storage: Storage = Depends(get_storage),
) -> None:
    file = await _get_or_404(file_id)
    if file.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or an admin can delete this file")
    if file.storage_key:
        await storage.delete(file.storage_key)
    await file.delete()
