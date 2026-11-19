from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class MessageOut(BaseModel):
    message: str


class ResetTokenRequest(BaseModel):
    token: str = Field(max_length=200)


class ResetTokenStatus(BaseModel):
    valid: bool
    reason: str | None = None  # "invalid" | "used" | "expired"


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
