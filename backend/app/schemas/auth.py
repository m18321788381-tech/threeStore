from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.core.config import MIN_ADMIN_PASSWORD_LENGTH
from app.schemas.common import ORMModel


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordIn(BaseModel):
    """改密码入参。

    新密码沿用 `ADMIN_PASSWORD` 对初始化口令的同一套长度下限（MIN_ADMIN_PASSWORD_LENGTH）：
    否则「改密码」会成为绕过密码策略的口子 —— 把强口令换成 6 位的弱口令，
    系统还得认。登录口令本身仍只校验非空（见 LoginIn），免得老口令强度不足时无法登录。
    """

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(
        min_length=MIN_ADMIN_PASSWORD_LENGTH, max_length=128
    )


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
