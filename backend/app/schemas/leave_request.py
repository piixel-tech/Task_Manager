from datetime import date, datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.leave_request import LeaveDuration, LeaveStatus, LeaveType
from app.schemas.project import UserBrief


def _iso(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError("Use a date like 2026-11-20") from exc


class LeaveRequestCreate(BaseModel):
    type: LeaveType
    start_date: str
    end_date: str
    duration: LeaveDuration = "full"
    reason: str = Field(min_length=1, max_length=500)
    admin_id: PydanticObjectId  # one admin of the employee's company

    @field_validator("start_date", "end_date")
    @classmethod
    def _dates(cls, v: str) -> str:
        return _iso(v)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Give a reason")
        return v

    @model_validator(mode="after")
    def _shape(self) -> "LeaveRequestCreate":
        if self.end_date < self.start_date:
            raise ValueError("The end date cannot be before the start date")
        if self.duration != "full" and self.start_date != self.end_date:
            raise ValueError("A half day needs the same start and end date")
        return self


class LeaveReject(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Give a reason for rejecting")
        return v


class LeaveRequestOut(BaseModel):
    id: PydanticObjectId
    user: UserBrief
    company_id: PydanticObjectId
    company_name: str
    type: LeaveType
    start_date: str
    end_date: str
    duration: LeaveDuration
    reason: str
    admin: UserBrief
    status: LeaveStatus
    reject_reason: str | None
    created_at: datetime
    decided_at: datetime | None
    decided_by: UserBrief | None
