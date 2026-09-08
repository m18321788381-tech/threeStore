"""认证：登录 / 刷新 / 当前用户。

登录防爆破（三层）：
1. **总量限流**：同一 IP 在窗口内的总尝试次数（成功+失败）上限，挡高频扫描。
2. **失败锁定**：同一 IP 窗口内失败达上限即锁定，另按「IP + 账号」单独计数，
   防针对单个账号的慢速爆破。
3. **时序均衡**：用户名不存在时也做一次等效的 bcrypt 校验，避免响应时间差异
   泄露账号是否存在（配合统一的错误文案）。

> 历史事故：此前失败计数调用了限流但**丢弃了返回值**，等于写了限流却从不拦截，
> 配合默认口令导致后台可被任意接管。现在失败计数既写也读。
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user
from app.core.config import settings
from app.core.rate_limit import ahit, areset, aremaining
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas import LoginIn, RefreshIn, TokenOut, UserOut, ok

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("blog.auth")

# 用户名不存在时用于「陪跑」的哈希，使校验耗时与真实账号相当，消除时序侧信道。
_DUMMY_HASH: str | None = None


def _dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(f"__no_such_user__{secrets.token_hex(16)}")
    return _DUMMY_HASH


def _too_many_attempts(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(settings.LOGIN_LOCK_SECONDS)},
    )


@router.post("/login")
async def login(
    payload: LoginIn,
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    ip = get_client_ip(request)
    account = (payload.username or "").strip().lower()

    # 1) 总量限流：挡住高频口令喷洒
    if not await ahit(
        f"login:total:{ip}", settings.LOGIN_GLOBAL_LIMIT, settings.LOGIN_GLOBAL_WINDOW
    ):
        raise _too_many_attempts("尝试过于频繁，请稍后再试")

    fail_key = f"login:fail:{ip}"
    acct_key = f"login:fail:{ip}:{account}"

    # 2) 失败锁定检查（只读计数，不递增）
    if await aremaining(fail_key, settings.LOGIN_FAIL_LIMIT, settings.LOGIN_FAIL_WINDOW) <= 0:
        raise _too_many_attempts(
            f"登录失败次数过多，请 {settings.LOGIN_LOCK_SECONDS // 60} 分钟后重试"
        )
    if (
        await aremaining(
            acct_key, settings.LOGIN_FAIL_LIMIT_PER_ACCOUNT, settings.LOGIN_FAIL_WINDOW
        )
        <= 0
    ):
        raise _too_many_attempts(
            f"该账号登录失败次数过多，请 {settings.LOGIN_LOCK_SECONDS // 60} 分钟后重试"
        )

    result = await session.execute(
        select(User).where(User.username == payload.username)
    )
    user = result.scalar_one_or_none()

    # 3) 时序均衡：账号不存在时也执行一次 bcrypt 校验
    password_ok = verify_password(
        payload.password, user.password_hash if user else _dummy_hash()
    )

    if user is None or not password_ok or not user.is_active:
        await ahit(fail_key, settings.LOGIN_FAIL_LIMIT, settings.LOGIN_FAIL_WINDOW)
        await ahit(acct_key, settings.LOGIN_FAIL_LIMIT_PER_ACCOUNT, settings.LOGIN_FAIL_WINDOW)
        logger.warning("登录失败 ip=%s account=%s", ip, account)
        # 统一文案：不区分「用户不存在」「密码错误」「账号禁用」
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误"
        )

    # 登录成功：清空该 IP 与账号的失败计数
    await areset(fail_key)
    await areset(acct_key)

    user.last_login_at = datetime.now(tz=timezone.utc)
    await session.commit()
    logger.info("登录成功 ip=%s account=%s", ip, account)

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
