"""API 公共依赖：鉴权、分页参数、客户端 IP。"""
from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import UserRole
from app.core.security import decode_token, token_version_of
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

# 令牌代次不匹配时的统一提示。刻意区别于「Token 已过期」：过期是等一会儿就好，
# 被吊销是「你必须重新登录」，用户看到不同文案才知道该做什么。
REVOKED_DETAIL = "凭证已失效，请重新登录"


class Pagination:
    def __init__(self, page: int, page_size: int):
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), settings.MAX_PAGE_SIZE)
        self.offset = (self.page - 1) * self.page_size


def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
) -> Pagination:
    return Pagination(page, page_size)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    """解析 Bearer Token 并返回用户；失败统一 401。"""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少认证凭证"
        )
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的凭证或 Token 已过期",
        )
    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的凭证"
        )

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用"
        )
    # 代次比对：改密码等操作会把 users.token_version 递增，此前签发的 token
    # 即便签名合法、未过期，也必须失效。这是 JWT 唯一能「主动吊销」的着力点。
    if token_version_of(payload) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=REVOKED_DETAIL
        )
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限"
        )
    return user


async def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> User | None:
    """可选鉴权：公开接口中判断是否博主（博主评论自动通过）。"""
    if credentials is None or not credentials.credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    try:
        user_id = uuid.UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        return None
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        return None
    # 与 get_current_user 保持同一套判定，否则「可选鉴权」会成为绕过吊销的后门：
    # 被吊销的博主 token 在这里若仍被认作博主，评论就能继续免审核直达。
    if token_version_of(payload) != user.token_version:
        return None
    return user


__all__ = [
    "Pagination",
    "pagination_params",
    "get_client_ip",
    "get_current_user",
    "get_current_admin",
    "optional_user",
]
