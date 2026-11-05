from datetime import datetime, timezone
from typing import Iterable

from beanie import PydanticObjectId

from app.models import Notification, User
from app.schemas.notification import Actor, NotificationOut
from app.services.focus import focused_ids
from app.services.prefs import wants
from app.services.ws_manager import manager


async def outs_with_actors(docs: Iterable[Notification]) -> list[NotificationOut]:
    """Notifications as the API returns them, each with the name and photo of the person who triggered it."""
    docs = list(docs)
    ids = {d.actor_id for d in docs if d.actor_id}
    actors = {u.id: u for u in await User.find({"_id": {"$in": list(ids)}}).to_list()} if ids else {}
    out = []
    for d in docs:
        o = NotificationOut.model_validate(d, from_attributes=True)
        a = actors.get(d.actor_id) if d.actor_id else None
        out.append(o.model_copy(update={"actor": Actor(id=a.id, name=a.name, avatar_url=a.avatar_url) if a else None}))
    return out


IMPORTANT_PREFIXES = ("mention", "approval", "client_approval", "task_overdue")


def priority_of(notification_type: str) -> str:
    """Important: @mentions, approvals and overdue tasks. They get their own sound and ignore mutes."""
    return "important" if notification_type.startswith(IMPORTANT_PREFIXES) else "normal"


def is_muted(user: User, mute_key: str | None, now: datetime | None = None) -> bool:
    """Has this person muted that chat or subfolder (and is the mute still running)?"""
    until = (user.mutes or {}).get(mute_key) if mute_key else None
    if not until:
        return False
    if until == "always":
        return True
    try:
        return datetime.fromisoformat(until) > (now or datetime.now(timezone.utc))
    except ValueError:
        return False


async def notify(
    user_ids: Iterable[PydanticObjectId],
    type: str,
    title: str,
    body: str = "",
    link: str | None = None,
    actor_id: PydanticObjectId | None = None,
    mute_key: str | None = None,
) -> list[Notification]:
    """Save one notification per user and push it to their open WebSockets.

    `mute_key` ("chat:<id>", "subfolder:<id>"): people who muted it still find it in the bell but get no live popup or sound,
    unless the notification is important. Notifications are kept forever; nothing deletes them.
    """
    recipients = list(dict.fromkeys(user_ids))  # de-dupe, keep order
    if not recipients:
        return []

    # People can switch whole kinds of notification off in their settings: nothing is saved or shown for them.
    people = {u.id: u for u in await User.find({"_id": {"$in": recipients}}).to_list()}
    recipients = [uid for uid in recipients if uid not in people or wants(people[uid], type)]
    if not recipients:
        return []

    priority = priority_of(type)
    docs = [
        Notification(user_id=uid, type=type, title=title, body=body, link=link, actor_id=actor_id, priority=priority)
        for uid in recipients
    ]
    await Notification.insert_many(docs)

    # Live push is best-effort: the notification is already stored. People in Focus find it in the bell later.
    quiet = await focused_ids(recipients)
    for doc, out in zip(docs, await outs_with_actors(docs)):
        if doc.user_id in quiet:
            continue
        person = people.get(doc.user_id)
        if priority == "normal" and person is not None and is_muted(person, mute_key):
            continue
        await manager.send_to_users([doc.user_id], "notification", out.model_dump(mode="json"))
    return docs
