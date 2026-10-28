from datetime import datetime
from typing import Literal

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.chat import MessageType
from app.models.office import REACTIONS
from app.schemas.file import FileOut
from app.schemas.project import UserBrief

MAX_BODY = 4000  # characters of text
MAX_HTML = 20000  # the same text with its formatting
MAX_SCHEDULED_FILES = 5
MAX_MEMBERS = 50
MAX_VOICE_SECONDS = 60 * 60
MAX_APPROVAL_FILES = 10

Status = Literal["sent", "delivered", "seen"]


def _name(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("must not be empty")
    return v


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    member_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_MEMBERS)
    subfolder_id: PydanticObjectId | None = None

    clean_name = field_validator("name")(_name)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    subfolder_id: PydanticObjectId | None = None  # send null to unlink

    clean_name = field_validator("name")(lambda v: _name(v) if v is not None else v)


class MembersAdd(BaseModel):
    user_ids: list[PydanticObjectId] = Field(min_length=1, max_length=MAX_MEMBERS)


class MessageCreate(BaseModel):
    type: MessageType = "text"
    body: str = Field(default="", max_length=MAX_HTML)
    html: bool = False  # body is HTML from the rich editor
    file_id: PydanticObjectId | None = None
    duration: int | None = Field(default=None, ge=0, le=MAX_VOICE_SECONDS)
    reply_to: PydanticObjectId | None = None

    @model_validator(mode="after")
    def _shape(self) -> "MessageCreate":
        if not self.html and len(self.body) > MAX_BODY:
            raise ValueError(f"Keep messages under {MAX_BODY} characters")
        self.body = self.body.strip()
        if self.type == "text":
            if not self.body:
                raise ValueError("A text message needs some text")
            if self.file_id:
                raise ValueError("A text message has no file")
        elif self.type == "approval":
            raise ValueError("Send approvals with the approvals endpoint")
        elif not self.file_id:
            raise ValueError(f"A {self.type} message needs a file_id")
        if self.type != "voice":
            self.duration = None
        return self


class ApprovalCreate(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    file_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_APPROVAL_FILES)
    approve_label: str = Field(default="Approve", min_length=1, max_length=30)
    reject_label: str = Field(default="Reject", min_length=1, max_length=30)

    clean_question = field_validator("question")(_name)
    clean_approve = field_validator("approve_label")(_name)
    clean_reject = field_validator("reject_label")(_name)


class ApprovalAnswer(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _reason(self) -> "ApprovalAnswer":
        reason = (self.reason or "").strip()
        if self.decision == "rejected" and not reason:
            raise ValueError("Say why you are rejecting this")
        self.reason = reason if self.decision == "rejected" else None
        return self


class ReactionSet(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def _emoji(cls, v: str) -> str:
        if v not in REACTIONS:
            raise ValueError(f"Pick one of {' '.join(REACTIONS)}")
        return v


class ForwardBody(BaseModel):
    group_ids: list[PydanticObjectId] = Field(min_length=1, max_length=10)


class SubfolderBrief(BaseModel):
    id: PydanticObjectId
    name: str
    project_id: PydanticObjectId


class LastMessage(BaseModel):
    preview: str
    sender: UserBrief | None
    at: datetime
    mine: bool


class GroupOut(BaseModel):
    id: PydanticObjectId
    name: str
    members: list[UserBrief]
    joined_at: dict[str, datetime]  # user id -> when they joined: messages sent earlier don't wait on them for ticks
    created_by: PydanticObjectId
    subfolder: SubfolderBrief | None
    last_message: LastMessage | None
    unread_count: int
    can_manage: bool  # the creator: rename, link, remove people, delete
    can_invite: bool  # admins and heads of the linked subfolder: make client invite links
    can_pin: bool  # team members: pin and unpin messages
    pinned_ids: list[PydanticObjectId]  # newest pin first
    created_at: datetime


class ApprovalOut(BaseModel):
    id: PydanticObjectId
    question: str
    files: list[FileOut]
    approve_label: str
    reject_label: str
    status: Literal["pending", "approved", "rejected", "cancelled"]
    reason: str | None
    answered_by: UserBrief | None
    answered_at: datetime | None
    created_at: datetime
    next_reminder_at: datetime | None  # only while pending


class ApprovalItem(BaseModel):
    """An approval with where it lives, for the pending-approvals list."""

    approval: ApprovalOut
    group_id: PydanticObjectId
    group_name: str
    message_id: PydanticObjectId | None


class TaskRef(BaseModel):
    id: PydanticObjectId
    title: str


class ReplyOut(BaseModel):
    id: PydanticObjectId
    sender: UserBrief | None
    type: MessageType
    preview: str
    deleted: bool


class ReactionOut(BaseModel):
    emoji: str
    user_ids: list[PydanticObjectId]


class ReceiptOut(BaseModel):
    user_id: PydanticObjectId
    at: datetime


class MessageOut(BaseModel):
    """Same for every viewer, so one copy can be pushed to the whole group."""

    id: PydanticObjectId
    group_id: PydanticObjectId
    sender: UserBrief | None
    type: MessageType
    body: str  # HTML when `html`, otherwise plain text
    html: bool
    text: str  # always plain: previews, search hits
    mentions: list[PydanticObjectId]
    links: list[str]
    file: FileOut | None
    duration: int | None
    reply: ReplyOut | None
    forwarded_from: UserBrief | None
    approval: ApprovalOut | None
    reminder: bool  # a repeat of an approval card that is still waiting
    task: TaskRef | None  # a task was created from this message
    reactions: list[ReactionOut]
    delivered_to: list[ReceiptOut]
    seen_by: list[ReceiptOut]
    status: Status  # ✓ sent, ✓✓ delivered to everyone, blue ✓✓ seen by everyone
    deleted: bool  # deleted for everyone
    created_at: datetime


class MessagePage(BaseModel):
    items: list[MessageOut]  # oldest first
    has_more: bool  # older messages exist
    has_newer: bool = False  # newer ones exist (only when the page doesn't end at the latest message)


class SharedPage(BaseModel):
    """Media or docs of a group, newest first."""

    items: list[MessageOut]
    has_more: bool


class LinkItem(BaseModel):
    url: str
    title: str | None
    message_id: PydanticObjectId
    sender: UserBrief | None
    created_at: datetime


class LinkPage(BaseModel):
    items: list[LinkItem]  # newest first
    has_more: bool
    next_before: PydanticObjectId | None  # pass as `before` for the next page


class SearchHit(BaseModel):
    group_id: PydanticObjectId
    group_name: str
    message: MessageOut


class SearchPage(BaseModel):
    items: list[SearchHit]  # newest first
    has_more: bool


class PinOut(BaseModel):
    message: MessageOut
    pinned_by: UserBrief | None
    pinned_at: datetime


class ScheduledCreate(BaseModel):
    body: str = Field(default="", max_length=MAX_HTML)
    file_ids: list[PydanticObjectId] = Field(default_factory=list, max_length=MAX_SCHEDULED_FILES)
    send_at: datetime


class ScheduledUpdate(BaseModel):
    body: str | None = Field(default=None, max_length=MAX_HTML)
    file_ids: list[PydanticObjectId] | None = Field(default=None, max_length=MAX_SCHEDULED_FILES)
    send_at: datetime | None = None


class ScheduledOut(BaseModel):
    id: PydanticObjectId
    group_id: PydanticObjectId
    body: str
    text: str
    files: list[FileOut]
    send_at: datetime
    created_at: datetime


class ReadOut(BaseModel):
    unread_count: int


class UnreadOut(BaseModel):
    total: int
    by_group: dict[str, int]
