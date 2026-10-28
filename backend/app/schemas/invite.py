from datetime import datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.auth import TokenResponse
from app.schemas.project import UserBrief


class InviteOut(BaseModel):
    id: PydanticObjectId
    group_id: PydanticObjectId
    token: str
    expires_at: datetime
    created_at: datetime
    created_by: UserBrief | None
    used_count: int  # how many clients have joined with this link


class InvitePreview(BaseModel):
    """What someone sees before they sign in: enough to know what they are joining."""

    group_name: str
    invited_by: str | None
    project_name: str | None
    expires_at: datetime


class SignupBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be empty")
        return v


class JoinOut(BaseModel):
    group_id: PydanticObjectId


class SignupOut(TokenResponse):
    group_id: PydanticObjectId
