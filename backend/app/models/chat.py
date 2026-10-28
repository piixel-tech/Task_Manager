from datetime import datetime, timezone
from typing import Literal

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import IndexModel

MessageType = Literal["text", "file", "image", "voice", "approval"]


class Receipt(BaseModel):
    user_id: PydanticObjectId
    at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LinkRef(BaseModel):
    url: str
    title: str | None = None
    checked: bool = False  # the page has been looked at (title may still be empty)


class Pin(BaseModel):
    message_id: PydanticObjectId
    pinned_by: PydanticObjectId
    pinned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatGroup(Document):
    name: str
    member_ids: list[PydanticObjectId] = Field(default_factory=list)  # employees and admins
    client_ids: list[PydanticObjectId] = Field(default_factory=list)  # filled in by the client chat (8b)
    subfolder_id: PydanticObjectId | None = None  # optional link, no effect on who is in the group
    created_by: PydanticObjectId
    joined_at: dict[str, datetime] = Field(default_factory=dict)  # user id -> when they joined; unread counts start there
    pins: list[Pin] = Field(default_factory=list)  # newest last
    last_message_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "chat_groups"
        indexes = [IndexModel([("member_ids", 1)])]


class ChatMessage(Document):
    group_id: PydanticObjectId
    sender_id: PydanticObjectId
    type: MessageType = "text"
    body: str = ""  # the text, or an optional caption for a file, image or voice note (sanitized HTML when `html`)
    html: bool = False  # body came from the rich editor; older messages are plain text
    text: str = ""  # plain version of an html body, for search and previews
    mentions: list[PydanticObjectId] = Field(default_factory=list)
    links: list[LinkRef] = Field(default_factory=list)
    task_id: PydanticObjectId | None = None  # a task was created from this message
    file_kind: Literal["media", "doc"] | None = None  # which shared tab a file belongs in
    file_id: PydanticObjectId | None = None
    duration: int | None = None  # voice notes: seconds
    reply_to: PydanticObjectId | None = None
    forwarded_from: PydanticObjectId | None = None  # the original sender, when this is a forward
    approval_id: PydanticObjectId | None = None  # type "approval": the card this message shows
    reminder: bool = False  # a re-post of an approval card that is still waiting for an answer
    reactions: dict[str, list[PydanticObjectId]] = Field(default_factory=dict)  # emoji -> who reacted
    delivered_to: list[Receipt] = Field(default_factory=list)
    seen_by: list[Receipt] = Field(default_factory=list)
    deleted_for: list[PydanticObjectId] = Field(default_factory=list)  # "delete for me"
    deleted_for_all: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "messages"
        indexes = [IndexModel([("group_id", 1), ("_id", -1)])]


class ScheduledMessage(Document):
    """A message waiting for its time; a job sends it as an ordinary message from the author."""

    group_id: PydanticObjectId
    author_id: PydanticObjectId
    body: str = ""  # sanitized HTML
    file_ids: list[PydanticObjectId] = Field(default_factory=list)
    send_at: datetime
    status: Literal["scheduled", "sent", "cancelled", "failed"] = "scheduled"
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "scheduled_messages"
        indexes = [IndexModel([("status", 1), ("send_at", 1)]), IndexModel([("group_id", 1), ("author_id", 1)])]
