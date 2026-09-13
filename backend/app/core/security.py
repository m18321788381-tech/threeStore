"""认证与密码学工具：bcrypt 哈希 + JWT 签发/校验。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


# ---------------------------------------------------------------- password ---
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------- JWT ---
def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


# 令牌代次声明。与 users.token_version 对应：签发时写入，鉴权时比对。
# 名字刻意取短（ver），因为它出现在每一个 token 里。
TOKEN_VERSION_CLAIM = "ver"


def _norm_version(version: int | None) -> int:
    """把代次归一成 int。

    为什么要这一步：ORM 的列默认值（default=0）只在 flush 时落到实处，所以对
    「刚构造、尚未 flush」的 User 而言 `user.token_version` 可能仍是 None。
    若原样写进 JWT，会得到 `"ver": null`，而读取端把 null 判为 -1 ——
    结果是一个**刚登录就立刻失效**的诡异故障。这里归一成 0，与读取端对齐。
    """
    return 0 if version is None else int(version)


def create_access_token(
    subject: str, version: int | None, extra: dict[str, Any] | None = None
) -> str:
    """签发 access token。`version` 是签发时的账号代次，必传。

    刻意不设默认值：漏传会让 token 的 ver 落成缺省 0，而 0 恰好与未改过密码的
    用户一致 —— 这种「静默失效」的安全漏洞不会报错，只会让吊销功能形同虚设。
    设为必填参数，漏传在开发期就炸。
    """
    expire = _now() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE)
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "type": "access",
        TOKEN_VERSION_CLAIM: _norm_version(version),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str, version: int | None) -> str:
    expire = _now() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE)
    payload = {
        "sub": subject,
        "exp": expire,
        "type": "refresh",
        TOKEN_VERSION_CLAIM: _norm_version(version),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    """校验并解码；失败返回 None（不抛异常，方便依赖层统一处理）。"""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        return None
    return payload


def token_version_of(payload: dict[str, Any] | None) -> int:
    """读出 token 里的代次；**缺失按 0 处理**。

    缺失按 0 而非「视为无效」是刻意的：升级到本版本时，线上在用的 token 都是
    旧版签发的、不带该声明，若视为无效就等于强制全体重新登录。按 0 处理，
    它们与存量用户（token_version 默认 0）依然匹配，升级是平滑的；
    而改密码会把库里的值推到 1，这些老 token 随即全部失效。

    解析不出来（被塞了非数字）返回 -1，与任何合法代次都不等 —— 宁可拒绝。
    """
    if not payload:
        return -1
    raw = payload.get(TOKEN_VERSION_CLAIM, 0)
    if isinstance(raw, bool):  # bool 是 int 子类，显式挡掉，避免 True 被当成 1
        return -1
    try:
        return int(raw)
    except (TypeError, ValueError):
        return -1
