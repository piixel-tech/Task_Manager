import re
from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.core.permissions import require
from app.models import User
from app.models.office import CATEGORIES, OfficePost
from app.schemas.office import (
    OfficeSummary,
    PostCreate,
    PostList,
    PostOut,
    ReactionSet,
    ResolveSet,
    SeenBody,
    SeenOut,
    Status,
)
from app.services.office import check_photo, post_outs, snippet, tell_everyone, unseen_filter

router = APIRouter(prefix="/office", tags=["office"])

SUMMARY_POSTS = 3


async def _get_or_404(post_id: PydanticObjectId) -> OfficePost:
    post = await OfficePost.get(post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


async def _one(post_id: PydanticObjectId, user: User) -> PostOut:
    return (await post_outs([await OfficePost.get(post_id)], user))[0]


@router.get("/posts", response_model=PostList)
async def list_posts(
    status_: Status = Query("all", alias="status"),
    category: str | None = Query(None, description="pantry, electricity, facilities, it or general"),
    q: str | None = Query(None, max_length=100, description="Search the text"),
    limit: int = Query(30, ge=1, le=100),
    skip: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
) -> PostList:
    """Newest first. Everything stays here: resolved posts are the history."""
    require(user, "office.view")
    if category is not None and category not in CATEGORIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown category: {category}")
    query: dict = {}
    if status_ != "all":
        query["resolved"] = status_ == "resolved"
    if category:
        query["category"] = category
    if q and q.strip():
        query["text"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    total = await OfficePost.find(query).count()
    posts = await OfficePost.find(query).sort([("created_at", -1), ("_id", -1)]).skip(skip).limit(limit).to_list()
    return PostList(total=total, unseen_count=await OfficePost.find(unseen_filter(user)).count(), items=await post_outs(posts, user))


@router.get("/summary", response_model=OfficeSummary)
async def summary(user: User = Depends(get_current_user)) -> OfficeSummary:
    """For the dashboard card: the latest unresolved posts and how many you haven't seen."""
    require(user, "office.view")
    latest = await OfficePost.find({"resolved": False}).sort([("created_at", -1), ("_id", -1)]).limit(SUMMARY_POSTS).to_list()
    return OfficeSummary(
        unseen_count=await OfficePost.find(unseen_filter(user)).count(),
        open_count=await OfficePost.find({"resolved": False}).count(),
        latest=await post_outs(latest, user),
    )


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(body: PostCreate, user: User = Depends(get_current_user)) -> PostOut:
    require(user, "office.post")
    if body.photo_id:
        await check_photo(body.photo_id, user)
    category = body.category or "general"
    label, emoji = CATEGORIES[category]
    post = await OfficePost(author_id=user.id, text=body.text, category=category, emoji=emoji, photo_id=body.photo_id).insert()
    await tell_everyone(user, type="office_post", title=f"{emoji} {label}: {user.name} posted", body=snippet(post.text))
    return await _one(post.id, user)


@router.post("/seen", response_model=SeenOut)
async def mark_seen(body: SeenBody, user: User = Depends(get_current_user)) -> SeenOut:
    """Record that you viewed these posts. Your own posts and unknown ids are ignored."""
    require(user, "office.view")
    await OfficePost.find({"_id": {"$in": body.ids}, "author_id": {"$ne": user.id}}).update({"$addToSet": {"seen_by": user.id}})
    return SeenOut(unseen_count=await OfficePost.find(unseen_filter(user)).count())


@router.put("/posts/{post_id}/reactions", response_model=PostOut)
async def toggle_reaction(post_id: PydanticObjectId, body: ReactionSet, user: User = Depends(get_current_user)) -> PostOut:
    """React with an emoji; sending the same one again takes it back."""
    require(user, "office.view")
    post = await _get_or_404(post_id)
    field = f"reactions.{body.emoji}"
    op = "$pull" if user.id in post.reactions.get(body.emoji, []) else "$addToSet"
    await OfficePost.find({"_id": post.id}).update({op: {field: user.id}})
    return await _one(post.id, user)


@router.patch("/posts/{post_id}", response_model=PostOut)
async def set_resolved(post_id: PydanticObjectId, body: ResolveSet, user: User = Depends(get_current_user)) -> PostOut:
    """Mark an issue resolved (or reopen it). Only the author or an admin."""
    post = await _get_or_404(post_id)
    require(user, "office.resolve", creator_id=post.author_id)
    if post.resolved != body.resolved:
        update = (
            {"resolved": True, "resolved_by": user.id, "resolved_at": datetime.now(timezone.utc)}
            if body.resolved
            else {"resolved": False, "resolved_by": None, "resolved_at": None}
        )
        # Only flips if nobody else already did, so a double click doesn't notify twice.
        flipped = await OfficePost.find({"_id": post.id, "resolved": post.resolved}).update({"$set": update})
        if flipped and flipped.modified_count == 1:
            await tell_everyone(
                user,
                type="office_resolved" if body.resolved else "office_reopened",
                title=f"{'Resolved' if body.resolved else 'Reopened'}: {CATEGORIES[post.category][0]}",
                body=f"{user.name} {'resolved' if body.resolved else 'reopened'}: {snippet(post.text, 100)}",
            )
    return await _one(post.id, user)
