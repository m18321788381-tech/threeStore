"""认证：登录 / 刷新 / 当前用户。登录接口带 IP 级限流。"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user
from app.core.config import settings
from app.core.rate_limit import hit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas import LoginIn, RefreshIn, TokenOut, UserOut, ok

router = APIRouter(prefix="/auth", tags=["auth"])

# 登录失败锁定：同一 IP 10 分钟内最多 10 次失败
LOGIN_FAIL_LIMIT = 10
LOGIN_FAIL_WINDOW = 600


@router.post("/login")
async def login(
    payload: LoginIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    ip = get_client_ip(request)
    if not hit(f"login:{ip}", LOGIN_FAIL_LIMIT + 5, LOGIN_FAIL_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="尝试过于频繁，请稍后再试",
        )

    result = await session.execute(
        select(User).where(User.username == payload.username)
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        hit(f"login-fail:{ip}", LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误"
        )

    user.last_login_at = datetime.now(tz=timezone.utc)
    await session.commit()

    return ok(
        {
            "access_token": create_access_token(str(user.id)),
            "refresh_token": create_refresh_token(str(user.id)),
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE * 60,
        }
    )


@router.post("/refresh")
async def refresh(payload: RefreshIn, session: AsyncSession = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if not data or data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh Token 无效或已过期"
        )
    try:
        user_id = UUID(str(data.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh Token 无效"
        )
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用"
        )
    return ok(
        {
            "access_token": create_access_token(str(user.id)),
            "refresh_token": create_refresh_token(str(user.id)),
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE * 60,
        }
    )


@router.get("/me", response_model_exclude_none=True)
async def me(user: User = Depends(get_current_user)):
    return ok(
        UserOut(
            id=str(user.id),
            username=user.username,
            email=user.email,
            display_name=user.display_name or user.username,
            avatar=user.avatar or "",
            bio=user.bio or "",
            role=user.role,
        ).model_dump()
    )


__all__ = ["router", "TokenOut"]
