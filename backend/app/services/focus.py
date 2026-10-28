"""Focus mode: until `focus_until` a person gets no live popups, sounds or badge bumps. Notifications still land in the bell."""
from datetime import datetime, timezone
from typing import Iterable

from beanie import PydanticObjectId

from app.core.timeutil import as_utc
from app.models import User


def in_focus(user: User, now: datetime | None = None) -> bool:
    return user.focus_until is not None and as_utc(user.focus_until) > (now or datetime.now(timezone.utc))


async def focused_ids(user_ids: Iterable[PydanticObjectId]) -> set[PydanticObjectId]:
    """Which of these people are in Focus right now."""
    ids = list(user_ids)
    if not ids:
        return set()
    rows = await User.find({"_id": {"$in": ids}, "focus_until": {"$gt": datetime.now(timezone.utc)}}).to_list()
    return {u.id for u in rows}
