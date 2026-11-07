from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import get_current_user
from app.models import PushSubscription, User
from app.services.push import is_configured

router = APIRouter(prefix="/push", tags=["push"])


class PublicKey(BaseModel):
    enabled: bool
    public_key: str | None


class Keys(BaseModel):
    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class SubscriptionIn(BaseModel):
    """What the browser's `PushSubscription.toJSON()` gives."""

    endpoint: str = Field(min_length=1, max_length=2048)
    keys: Keys


class Unsubscribe(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


@router.get("/public-key", response_model=PublicKey)
async def public_key(user: User = Depends(get_current_user)) -> PublicKey:
    """The VAPID public key the browser subscribes with. `enabled` is false until the server has its keys."""
    on = is_configured()
    return PublicKey(enabled=on, public_key=settings.VAPID_PUBLIC_KEY.strip() if on else None)


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(body: SubscriptionIn, user: User = Depends(get_current_user), user_agent: str = Header(default="")) -> None:
    """Save this browser's subscription for the signed-in person. The same browser signing in as someone else moves it to them."""
    if not is_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Push notifications are not set up on this server")
    sub = await PushSubscription.find_one(PushSubscription.endpoint == body.endpoint)
    if sub is None:
        sub = PushSubscription(user_id=user.id, endpoint=body.endpoint, p256dh=body.keys.p256dh, auth=body.keys.auth)
    sub.user_id, sub.p256dh, sub.auth, sub.user_agent = user.id, body.keys.p256dh, body.keys.auth, user_agent[:300]
    await sub.save()


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(body: Unsubscribe, user: User = Depends(get_current_user)) -> None:
    """Forget this browser (on sign-out). Only the owner can remove it."""
    await PushSubscription.find(PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id).delete()
