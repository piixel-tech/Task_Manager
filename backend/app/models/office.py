from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

Category = Literal["pantry", "electricity", "facilities", "it", "general"]

# key -> (label, emoji)
CATEGORIES: dict[str, tuple[str, str]] = {
    "pantry": ("Pantry", "☕"),
    "electricity": ("Electricity", "💡"),
    "facilities": ("AC/Facilities", "❄️"),
    "it": ("IT/Internet", "💻"),
    "general": ("General", "📢"),
}

REACTIONS = ("👍", "❤️", "😂", "😮", "🙏", "🎉")


class OfficePost(Document):
    """An issue or notice on the office board. Posts are never deleted: resolved ones stay as history."""

    author_id: PydanticObjectId
    text: str
    category: Category
    emoji: str  # the category's emoji, kept on the post
    photo_id: PydanticObjectId | None = None  # an image from the file service
    reactions: dict[str, list[PydanticObjectId]] = Field(default_factory=dict)  # emoji -> who reacted
    seen_by: list[PydanticObjectId] = Field(default_factory=list)  # everyone but the author who has viewed it
    resolved: bool = False
    resolved_by: PydanticObjectId | None = None
    resolved_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "office_posts"
        indexes = [IndexModel([("created_at", -1)]), IndexModel([("resolved", 1), ("created_at", -1)])]
