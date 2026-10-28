"""Google's push-notification webhook. Public (Google calls it, there is no bearer token), authenticated by the channel token."""
import hmac

from fastapi import APIRouter, Header, Response, status

from app.integrations.google.provider import channel_token
from app.integrations.runner import schedule_sync
from app.models import IntegrationConnection

router = APIRouter(prefix="/integrations/google", tags=["integrations"])


@router.post("/webhook", include_in_schema=False)
async def webhook(
    x_goog_channel_id: str | None = Header(default=None),
    x_goog_channel_token: str | None = Header(default=None),
    x_goog_resource_state: str | None = Header(default=None),
) -> Response:
    """Google says "something changed on a calendar". We only use it as a nudge to run the normal incremental sync."""
    if not x_goog_channel_id or not x_goog_channel_token:
        return Response(status_code=status.HTTP_400_BAD_REQUEST)
    if not hmac.compare_digest(x_goog_channel_token, channel_token(x_goog_channel_id)):
        return Response(status_code=status.HTTP_403_FORBIDDEN)
    if x_goog_resource_state == "sync":  # the hello Google sends when a channel is created
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    conn = await IntegrationConnection.find_one(
        {"provider": "google", "config.calendars.channel.id": x_goog_channel_id}
    )
    if conn is None:  # channel we've forgotten (disconnected): 404 tells Google to stop sending
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    if conn.status == "connected":
        schedule_sync(conn.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
