"""Helpers for the office board."""
from beanie import PydanticObjectId
from fastapi import HTTPException, status

from app.core.permissions import can
from app.core.timeutil import as_utc
from app.models import File, User
from app.models.office import CATEGORIES, REACTIONS, OfficePost
from app.schemas.file import FileOut
from app.schemas.office import PostOut, ReactionOut
from app.services.notify import notify
from app.services.projects import brief, load_users, unique


def unseen_filter(user: User) -> dict:
    """Unresolved posts by other people that this user hasn't viewed."""
    return {"resolved": False, "author_id": {"$ne": user.id}, "seen_by": {"$ne": user.id}}


async def post_outs(posts: list[OfficePost], viewer: User) -> list[PostOut]:
    photos = {f.id: f for f in await File.find({"_id": {"$in": unique(p.photo_id for p in posts if p.photo_id)}}).to_list()}
    people = await load_users(
        [p.author_id for p in posts]
        + [p.resolved_by for p in posts if p.resolved_by]
        + [u for p in posts for u in p.seen_by]
        + [u for p in posts for users in p.reactions.values() for u in users]
    )

    def who(ids: list[PydanticObjectId]) -> list:
        return [brief(people[i]) for i in ids if i in people]

    out = []
    for p in posts:
        photo = photos.get(p.photo_id) if p.photo_id else None
        out.append(
            PostOut(
                id=p.id,
                author=brief(people[p.author_id]) if p.author_id in people else None,
                text=p.text,
                category=p.category,
                category_label=CATEGORIES[p.category][0],
                emoji=p.emoji,
                photo=FileOut.model_validate(photo, from_attributes=True) if photo else None,
                reactions=[
                    ReactionOut(emoji=e, count=len(p.reactions[e]), mine=viewer.id in p.reactions[e], users=who(p.reactions[e]))
                    for e in REACTIONS
                    if p.reactions.get(e)
                ],
                seen_by=who(p.seen_by),
                seen_count=len(p.seen_by),
                is_new=p.author_id != viewer.id and viewer.id not in p.seen_by,
                resolved=p.resolved,
                resolved_by=brief(people[p.resolved_by]) if p.resolved_by in people else None,
                resolved_at=as_utc(p.resolved_at) if p.resolved_at else None,
                can_resolve=can(viewer, "office.resolve", creator_id=p.author_id),
                created_at=as_utc(p.created_at),
            )
        )
    return out


async def check_photo(photo_id: PydanticObjectId, user: User) -> None:
    """The photo must be an image the poster uploaded (not a link)."""
    f = await File.get(photo_id)
    if f is None or (f.owner_id != user.id and user.role != "admin"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid photo: upload it first")
    if f.kind != "upload" or not f.mime.startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The photo must be an image file")


async def tell_everyone(actor: User, *, type: str, title: str, body: str) -> None:
    """Notify every other active team member (live popup + bell). Links match each person's area of the app."""
    team = await User.find({"role": {"$in": ["admin", "employee"]}, "is_active": True, "_id": {"$ne": actor.id}}).to_list()
    for prefix, role in (("/admin", "admin"), ("/app", "employee")):
        ids = [u.id for u in team if u.role == role]
        await notify(ids, type=type, title=title, body=body, link=f"{prefix}/office", actor_id=actor.id)


def snippet(text: str, n: int = 140) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"
