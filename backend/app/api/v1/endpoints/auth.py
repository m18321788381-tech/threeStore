"""认证：登录 / 刷新 / 改密码 / 当前用户。

登录防爆破（三层）：
1. **总量限流**：同一 IP 在窗口内的总尝试次数（成功+失败）上限，挡高频扫描。
2. **失败锁定**：同一 IP 窗口内失败达上限即锁定，另按「IP + 账号」单独计数，
   防针对单个账号的慢速爆破。
3. **时序均衡**：用户名不存在时也做一次等效的 bcrypt 校验，避免响应时间差异
   泄露账号是否存在（配合统一的错误文案）。

> 历史事故：此前失败计数调用了限流但**丢弃了返回值**，等于写了限流却从不拦截，
> 配合默认口令导致后台可被任意接管。现在失败计数既写也读。

令牌吊销（token_version）：
    JWT 自包含，签发后无法单独作废。改密码接口会把 `users.token_version` 递增，
    登录 / 刷新 / 鉴权三处都比对该代次，因此改密码能一次性把**所有设备**的
    旧 access 与 refresh token 踢下线。见 `alembic/versions/0005_user_token_version.py`。
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import REVOKED_DETAIL, get_client_ip, get_current_user
from app.core.config import settings
from app.core.rate_limit import ahit, areset, aremaining
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    token_version_of,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas import ChangePasswordIn, LoginIn, RefreshIn, TokenOut, UserOut, ok

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
            "access_token": create_access_token(str(user.id), user.token_version),
            "refresh_token": create_refresh_token(str(user.id), user.token_version),
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
    # 吊销检查：此前这里只验证「用户存在且启用」，于是改密码后旧 refresh token
    # 仍可无限换取新 access token —— 改密码对攻击者无效。刷新点必须和访问点
    # 用同一套代次判定，否则它就是从后门续命的通道。
    if token_version_of(data) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=REVOKED_DETAIL
        )
    return ok(
        {
            "access_token": create_access_token(str(user.id), user.token_version),
            "refresh_token": create_refresh_token(str(user.id), user.token_version),
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE * 60,
        }
    )


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """改密码，并**顺带把该用户已签发的全部令牌作废**。

    这是 token_version 目前唯一的写入方 —— 只有「有触发器」的列才值得加，
    否则它会像 post_stats 的视图字段一样，变成一份没人读、也不知道对不对的真相。

    作废范围是「该用户全部设备」而非「除当前设备外」：后者需要单令牌级吊销
    （denylist / 会话表），代价远超本站所需。作为补偿，本接口返回**按新代次签发**
    的令牌对，当前设备用它替换本地凭证即可继续使用，不需要重新输密码。
    """
    # 限流：持有效 token 的攻击者仍可能在此爆破 current_password。
    # 复用登录失败的账号维度阈值，不新增配置项。
    key = f"pwd:fail:{user.id}"
    if await aremaining(
        key, settings.LOGIN_FAIL_LIMIT_PER_ACCOUNT, settings.LOGIN_FAIL_WINDOW
    ) <= 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"尝试次数过多，请 {settings.LOGIN_LOCK_SECONDS // 60} 分钟后重试",
            headers={"Retry-After": str(settings.LOGIN_LOCK_SECONDS)},
        )

    if not verify_password(payload.current_password, user.password_hash):
        await ahit(key, settings.LOGIN_FAIL_LIMIT_PER_ACCOUNT, settings.LOGIN_FAIL_WINDOW)
        logger.warning("改密码失败：当前密码不正确 user=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="当前密码不正确"
        )

    # 新旧相同不该被静默接受：那样用户以为「已改密码、旧令牌已失效」，
    # 实际上什么都没发生，是比报错更危险的幻觉。
    if payload.new_password == payload.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="新密码不能与当前密码相同"
        )

    await areset(key)
    user.password_hash = hash_password(payload.new_password)
    # 代次 +1：所有设备上既有的 access / refresh token 立刻失效
    user.token_version = (user.token_version or 0) + 1
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("改密码成功，已吊销既有令牌 user=%s ver=%s", user.id, user.token_version)

    return ok(
        {
            "access_token": create_access_token(str(user.id), user.token_version),
            "refresh_token": create_refresh_token(str(user.id), user.token_version),
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
