from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # 秒


class RefreshIn(BaseModel):
    refresh_token: str


class UserOut(ORMModel):
    id: str
    username: str
    email: EmailStr | str = ""
    display_name: str = ""
    avatar: str = ""
    bio: str = ""
    role: int = 0
