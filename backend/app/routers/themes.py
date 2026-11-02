"""Custom themes: each person can build up to five from three colours, and share any of them with the team.
They live on the person's account, so they follow them to every device."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user
from app.models import User
from app.services import themes
from app.services.chat import publish
from app.services.projects import client_team_ids

router = APIRouter(prefix="/themes", tags=["themes"])


class ThemeIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    primary: str
    accent: str
    bg: str
    shared: bool = False

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Give the theme a name")
        return v


class PreviewIn(BaseModel):
    primary: str
    accent: str
    bg: str


class ThemeOut(BaseModel):
    id: str
    name: str
    primary: str
    accent: str
    bg: str
    shared: bool
    light: dict[str, str]
    dark: dict[str, str]
    owner_id: str
    owner_name: str
    mine: bool


class ThemeList(BaseModel):
    mine: list[ThemeOut]
    team: list[ThemeOut]
    max: int = themes.MAX_CUSTOM_THEMES


def _out(t: dict, owner: User, viewer: User) -> ThemeOut:
    return ThemeOut(**{k: t[k] for k in ("id", "name", "primary", "accent", "bg", "shared", "light", "dark")}, owner_id=str(owner.id), owner_name=owner.name, mine=owner.id == viewer.id)


def _build(body: ThemeIn | PreviewIn) -> dict:
    try:
        return themes.generate(body.primary, body.accent, body.bg)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e) or "Colours must look like #aabbcc")


async def shared_by_others(viewer: User) -> list[tuple[User, dict]]:
    """Themes other people shared. A client only sees those of the people on their own projects."""
    owners = await User.find({"is_active": True, "custom_themes.shared": True}).to_list()
    allowed = set(await client_team_ids(viewer)) if viewer.role == "client" else None
    return [(o, t) for o in owners if o.id != viewer.id and (allowed is None or o.id in allowed) for t in o.custom_themes if t.get("shared")]


async def can_use(viewer: User, theme_id: str) -> bool:
    if any(t["id"] == theme_id for t in viewer.custom_themes):
        return True
    return any(t["id"] == theme_id for _, t in await shared_by_others(viewer))


async def _fall_back(theme_id: str, keep: User | None = None) -> None:
    """Everyone using a theme that was deleted or unshared goes back to purple (the owner keeps their own)."""
    value = f"custom:{theme_id}"
    for u in await User.find({"settings.palette": value}).to_list():
        if keep is not None and u.id == keep.id:
            continue
        u.settings = {**u.settings, "palette": "purple"}
        await u.save()


async def _tell_everyone() -> None:
    people = await User.find({"is_active": True}).to_list()
    await publish([p.id for p in people], "themes:changed", {})


@router.get("", response_model=ThemeList)
async def list_themes(user: User = Depends(get_current_user)) -> ThemeList:
    return ThemeList(mine=[_out(t, user, user) for t in user.custom_themes], team=[_out(t, o, user) for o, t in await shared_by_others(user)])


@router.post("/preview")
async def preview(body: PreviewIn, _: User = Depends(get_current_user)) -> dict:
    """The generated light and dark palettes for three colours, with notes on anything that was adjusted for readability."""
    return _build(body)


@router.post("", response_model=ThemeOut, status_code=status.HTTP_201_CREATED)
async def create_theme(body: ThemeIn, user: User = Depends(get_current_user)) -> ThemeOut:
    if len(user.custom_themes) >= themes.MAX_CUSTOM_THEMES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"You can have up to {themes.MAX_CUSTOM_THEMES} custom themes. Delete one to make room.")
    pal = _build(body)
    t = {"id": uuid.uuid4().hex, "name": body.name, "primary": body.primary.lower(), "accent": body.accent.lower(), "bg": body.bg.lower(), "shared": body.shared, "light": pal["light"], "dark": pal["dark"]}
    user.custom_themes = [*user.custom_themes, t]
    await user.save()
    if t["shared"]:
        await _tell_everyone()
    return _out(t, user, user)


@router.put("/{theme_id}", response_model=ThemeOut)
async def update_theme(theme_id: str, body: ThemeIn, user: User = Depends(get_current_user)) -> ThemeOut:
    old = next((t for t in user.custom_themes if t["id"] == theme_id), None)
    if old is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Theme not found")
    pal = _build(body)
    t = {**old, "name": body.name, "primary": body.primary.lower(), "accent": body.accent.lower(), "bg": body.bg.lower(), "shared": body.shared, "light": pal["light"], "dark": pal["dark"]}
    user.custom_themes = [t if x["id"] == theme_id else x for x in user.custom_themes]
    await user.save()
    if old.get("shared") and not t["shared"]:
        await _fall_back(theme_id, keep=user)
    if old.get("shared") or t["shared"]:
        await _tell_everyone()
    return _out(t, user, user)


@router.delete("/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_theme(theme_id: str, user: User = Depends(get_current_user)) -> None:
    old = next((t for t in user.custom_themes if t["id"] == theme_id), None)
    if old is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Theme not found")
    user.custom_themes = [t for t in user.custom_themes if t["id"] != theme_id]
    user.settings = {**user.settings, "palette": "purple"} if user.settings.get("palette") == f"custom:{theme_id}" else user.settings
    await user.save()
    await _fall_back(theme_id)
    if old.get("shared"):
        await _tell_everyone()
