"""令牌吊销（token_version）的回归测试。

为什么值得钉住：
    JWT 是自包含的，签发后服务端无法单独作废 —— 这是它的固有性质，不是 bug，
    但会被误当成"已经安全了"。本特性上线前的真实状态是：

      - `/auth/change-password` 端点**不存在**，所以压根没有触发器；
      - `/auth/refresh` 只检查「用户存在且启用」，不检查任何代次，
        因此旧 refresh token 可以无限换取新 access token。

    合起来的后果是：**密码泄露之后，改密码对攻击者毫无影响**。这是安全问题里最
    坏的一类 —— 用户以为自己做了一个正确的动作，实际什么都没发生。

    本文件覆盖三个必须同时成立的环节，缺一个吊销就是摆设：
      ① 签发时把代次写进 token；
      ② 鉴权（access）、刷新（refresh）、可选鉴权（optional_user）**三处都比对**；
      ③ 改密码真的递增代次，且当前设备拿到新代次令牌而无需重新输密码。

关于「老 token 缺 ver 声明按 0 处理」：
    这是刻意的平滑设计（见 `app/core/security.py::token_version_of` 的注释）。
    少了这条用例，后人很可能"顺手"把它改成「缺失即拒绝」，从而在升级时
    静默把所有人踢下线 —— 所以要有一条用例明确钉住这个语义。
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.api.deps import REVOKED_DETAIL, get_current_user, optional_user
from app.api.v1.endpoints.auth import change_password, login, refresh
from app.core.config import settings
from app.core.security import (
    TOKEN_VERSION_CLAIM,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    token_version_of,
)
from app.models.user import User
from app.schemas import ChangePasswordIn, LoginIn, RefreshIn

PASSWORD = "Str0ng!Passw0rd#2026"
NEW_PASSWORD = "Ev3n-Str0nger#2026!"


@pytest.fixture
async def session():
    """只建 users 一张表的内存库。

    `User.posts` 是 `lazy="noload"`，鉴权路径不会去 join 文章，因此无需 posts 表。
    """
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(User.__table__.create)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _add_user(session, *, version: int = 0, password: str = PASSWORD) -> User:
    user = User(
        id=uuid.uuid4(),
        username=f"u{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password(password),
        token_version=version,
    )
    session.add(user)
    await session.commit()
    return user


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _request(ip: str) -> Request:
    """构造最小可用的 Request，供 get_client_ip / 限流使用。"""
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/login",
            "query_string": b"",
            "headers": [],
            "client": (ip, 12345),
        }
    )


# ---------------------------------------------------------------------------
# ① 签发：代次必须真的写进 token
# ---------------------------------------------------------------------------


def test_access_token_carries_version():
    payload = decode_token(create_access_token("u-1", 3))
    assert payload is not None
    assert token_version_of(payload) == 3


def test_refresh_token_carries_version():
    payload = decode_token(create_refresh_token("u-1", 7))
    assert payload is not None
    assert token_version_of(payload) == 7


def test_legacy_token_without_version_reads_as_zero():
    """升级前签发的 token 没有 ver 声明 —— 必须仍按 0 处理，否则升级即全体登出。

    这条用例的价值不在于覆盖分支，而在于**锁住一个决策**：把「缺失」当成
    「无效」是很容易顺手做的"更安全"改动，但它的真实代价是全站会话被清空。
    """
    legacy = jwt.encode(
        {"sub": "u-1", "type": "access"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert token_version_of(decode_token(legacy)) == 0


def test_none_version_normalizes_to_zero():
    """刚构造未 flush 的 User 其 token_version 可能是 None。

    若原样写进 JWT 会得到 `"ver": null`，读取端判为 -1，
    表现为「刚登录就立刻失效」。这条钉住归一化。
    """
    payload = decode_token(create_access_token("u-1", None))
    assert payload is not None
    assert payload[TOKEN_VERSION_CLAIM] == 0
    assert token_version_of(payload) == 0


@pytest.mark.parametrize(
    "bad",
    ["abc", True, {"v": 1}, None, []],
    ids=["非数字字符串", "布尔", "字典", "null", "列表"],
)
def test_malformed_version_is_rejected(bad):
    """代次必须是能解析的数字，否则一律拒绝（返回 -1，与任何合法代次都不等）。"""
    assert token_version_of({TOKEN_VERSION_CLAIM: bad}) == -1


def test_absent_payload_is_rejected():
    """解码失败（None）与空 payload 一律拒绝，**不走**「缺失按 0」的宽恕逻辑。

    这两者与「合法 token 但没有 ver 声明」是不同的事：前者根本不是 JWT，
    后者是历史签发的合法凭证。宽恕只适用于后者。
    """
    assert token_version_of(None) == -1
    assert token_version_of({}) == -1


# ---------------------------------------------------------------------------
# ② 校验：access / refresh / optional 三处都必须拦
# ---------------------------------------------------------------------------


async def test_fresh_access_token_is_accepted(session):
    user = await _add_user(session, version=0)
    token = create_access_token(str(user.id), user.token_version)
    assert (await get_current_user(_creds(token), session)).id == user.id


async def test_stale_access_token_is_rejected(session):
    """代次落后一格即失效 —— 这是吊销的最小体现。"""
    user = await _add_user(session, version=0)
    token = create_access_token(str(user.id), 0)
    user.token_version = 1
    session.add(user)
    await session.commit()

    with pytest.raises(HTTPException) as exc:
        await get_current_user(_creds(token), session)
    assert exc.value.status_code == 401
    assert exc.value.detail == REVOKED_DETAIL


async def test_token_from_the_future_is_also_rejected(session):
    """代次比库里新也算不匹配。

    只判「小于」会留一个洞：如果哪天做了回滚（downgrade 或手工改小），
    提前签发的"未来"token 反而会被放行。相等才有效，语义更简单也更安全。
    """
    user = await _add_user(session, version=0)
    token = create_access_token(str(user.id), 5)

    with pytest.raises(HTTPException):
        await get_current_user(_creds(token), session)


async def test_optional_user_returns_none_when_revoked(session):
    """可选鉴权必须与强制鉴权同判。

    否则它会变成绕过吊销的后门：被吊销的博主 token 在评论接口里若仍被认作博主，
    评论就继续免审核直达。
    """
    user = await _add_user(session, version=0)
    token = create_access_token(str(user.id), 0)
    user.token_version = 1
    session.add(user)
    await session.commit()

    assert await optional_user(_creds(token), session) is None


async def test_refresh_cannot_rescue_a_revoked_token(session):
    """核心用例：旧 refresh token 改密码后不能再用。

    这是本特性要堵的那个洞 —— 修复前 refresh 只验「用户存在且启用」，
    于是攻击者可以靠它无限续命，改密码形同虚设。
    """
    user = await _add_user(session, version=0)
    stolen_refresh = create_refresh_token(str(user.id), 0)
    user.token_version = 1
    session.add(user)
    await session.commit()

    with pytest.raises(HTTPException) as exc:
        await refresh(RefreshIn(refresh_token=stolen_refresh), session)
    assert exc.value.status_code == 401
    assert exc.value.detail == REVOKED_DETAIL


async def test_refresh_works_with_current_version(session):
    user = await _add_user(session, version=2)
    data = await refresh(
        RefreshIn(refresh_token=create_refresh_token(str(user.id), 2)), session
    )
    payload = decode_token(data["data"]["access_token"])
    assert token_version_of(payload) == 2


# ---------------------------------------------------------------------------
# ③ 触发器：改密码必须递增代次，并把当前设备平滑接续
# ---------------------------------------------------------------------------


async def test_change_password_bumps_version_and_kills_old_tokens(session):
    """改密码后：旧 access / 旧 refresh 全废，新令牌可用。"""
    user = await _add_user(session, version=0)
    old_access = create_access_token(str(user.id), 0)
    old_refresh = create_refresh_token(str(user.id), 0)

    result = await change_password(
        ChangePasswordIn(current_password=PASSWORD, new_password=NEW_PASSWORD),
        user,
        session,
    )
    new_access = result["data"]["access_token"]

    # 库里代次已递增（不是只改了内存对象）
    fresh = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.token_version == 1

    # 旧令牌全部失效
    with pytest.raises(HTTPException):
        await get_current_user(_creds(old_access), session)
    with pytest.raises(HTTPException):
        await refresh(RefreshIn(refresh_token=old_refresh), session)

    # 当前设备不掉线：新令牌直接可用
    assert (await get_current_user(_creds(new_access), session)).id == user.id


async def test_change_password_updates_the_actual_password(session):
    user = await _add_user(session, version=0)
    await change_password(
        ChangePasswordIn(current_password=PASSWORD, new_password=NEW_PASSWORD),
        user,
        session,
    )

    from app.core.security import verify_password

    fresh = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert verify_password(NEW_PASSWORD, fresh.password_hash)
    assert not verify_password(PASSWORD, fresh.password_hash)


async def test_login_with_new_password_yields_new_version_tokens(session):
    user = await _add_user(session, version=0)
    await change_password(
        ChangePasswordIn(current_password=PASSWORD, new_password=NEW_PASSWORD),
        user,
        session,
    )

    out = await login(
        LoginIn(username=user.username, password=NEW_PASSWORD), _request("10.0.0.1"), session
    )
    assert token_version_of(decode_token(out["data"]["access_token"])) == 1


async def test_login_with_old_password_fails_after_change(session):
    user = await _add_user(session, version=0)
    await change_password(
        ChangePasswordIn(current_password=PASSWORD, new_password=NEW_PASSWORD),
        user,
        session,
    )

    with pytest.raises(HTTPException) as exc:
        await login(
            LoginIn(username=user.username, password=PASSWORD), _request("10.0.0.2"), session
        )
    assert exc.value.status_code == 401


async def test_change_password_rejects_wrong_current_password(session):
    user = await _add_user(session, version=0)
    with pytest.raises(HTTPException) as exc:
        await change_password(
            ChangePasswordIn(current_password="wrong-password-xx", new_password=NEW_PASSWORD),
            user,
            session,
        )
    assert exc.value.status_code == 400

    # 失败不得改变任何状态
    fresh = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
    assert fresh.token_version == 0
    from app.core.security import verify_password

    assert verify_password(PASSWORD, fresh.password_hash)


async def test_change_password_rejects_identical_password(session):
    """新旧相同必须报错。

    若静默接受，用户会以为「已改密码、旧令牌已失效」，实际什么都没发生 ——
    这比报错更危险，因为它制造了一个虚假的安全感。
    """
    user = await _add_user(session, version=0)
    with pytest.raises(HTTPException) as exc:
        await change_password(
            ChangePasswordIn(current_password=PASSWORD, new_password=PASSWORD),
            user,
            session,
        )
    assert exc.value.status_code == 400
    assert "相同" in exc.value.detail


def test_new_password_must_meet_length_policy():
    """新口令沿用 ADMIN_PASSWORD 的长度下限，避免「改密码」成为绕过策略的口子。"""
    with pytest.raises(ValidationError):
        ChangePasswordIn(current_password=PASSWORD, new_password="short1")


# ---------------------------------------------------------------------------
# 迁移：存量行必须被回填成 0，而不是升级失败
# ---------------------------------------------------------------------------


async def test_server_default_backfills_pre_existing_rows(session):
    """模拟升级前的存量行：INSERT 不带 token_version，必须落成 0 而非报错。

    这条对应迁移里的 `server_default='0'`。若省掉它，`alembic upgrade head`
    会在线上非空表上直接失败（column contains null values）——
    而那一刻通常已经在发布窗口里。
    """
    uid = uuid.uuid4().hex
    await session.execute(
        text(
            "INSERT INTO users "
            "(id, username, email, password_hash, display_name, avatar, bio, "
            " role, is_active, created_at, updated_at) "
            "VALUES (:id, :u, :e, :p, '', '', '', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ),
        {"id": uid, "u": f"legacy{uid[:6]}", "e": f"{uid[:6]}@example.com", "p": "x"},
    )
    await session.commit()

    row = (
        await session.execute(
            text("SELECT token_version FROM users WHERE username = :u"),
            {"u": f"legacy{uid[:6]}"},
        )
    ).scalar_one()
    assert row == 0
