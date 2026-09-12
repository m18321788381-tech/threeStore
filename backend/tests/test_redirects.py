"""slug 重定向服务的回归测试（SQLite 内存库，不依赖 PostgreSQL）。

为什么需要这一层：
    `record_slug_change` 的「扁平化」是三步骤的顺序逻辑，写错顺序不会报错、
    只会让重定向在某次连续改名之后突然失效（形成两跳链，而解析端只查一次）。
    这类 bug 在运行时是静默的，只能靠断言钉住。

为什么用 SQLite 而不是 PG：
    本机没有 Docker/PG，但这一层逻辑（UPDATE / SELECT / DELETE / 事务）
    不依赖任何 PG 专有能力，SQLite 足以验证语义。
    代价：不覆盖 PG 的并发行为，因此 `resolve_slug` 的原子自增
    仍以「用 SQL 表达式自增而非读改写」的代码审查为准。
"""
from __future__ import annotations

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.redirect import Redirect
from app.services.redirects import record_slug_change, resolve_slug


@pytest.fixture
async def session():
    """独立的内存库会话，每个用例一张干净的 redirects 表。"""
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,  # 内存库必须复用同一连接，否则每个连接看到的库不同
    )
    table = Redirect.__table__
    async with engine.begin() as conn:
        await conn.run_sync(table.create)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _mapping(session) -> dict[str, str]:
    rows = (await session.execute(sa.select(Redirect.old_slug, Redirect.new_slug))).all()
    return {old: new for old, new in rows}


async def test_records_mapping(session):
    await record_slug_change(session, "old-post", "new-post")
    await session.commit()
    assert await _mapping(session) == {"old-post": "new-post"}


async def test_flattens_existing_chain(session):
    """A→B 之后 B→C：A 必须直接指向 C，否则解析一次只能走到 B。"""
    await record_slug_change(session, "a", "b")
    await record_slug_change(session, "b", "c")
    await session.commit()

    m = await _mapping(session)
    assert m["a"] == "c", "旧记录没有被扁平化，解析一次拿不到最终地址"
    assert m["b"] == "c"
    assert await resolve_slug(session, "a") == "c"


async def test_slug_reverted_back_removes_self_loop(session):
    """A→B 之后又改回 A：不能留下「A 指向 A」的记录。"""
    await record_slug_change(session, "a", "b")
    await record_slug_change(session, "b", "a")
    await session.commit()

    m = await _mapping(session)
    assert "a" not in m, "自环记录会导致无限重定向"
    assert m == {"b": "a"}


async def test_same_slug_is_noop(session):
    await record_slug_change(session, "same", "same")
    await session.commit()
    assert await _mapping(session) == {}


async def test_empty_values_are_noop(session):
    await record_slug_change(session, "", "b")
    await record_slug_change(session, "a", "")
    await session.commit()
    assert await _mapping(session) == {}


async def test_resolve_miss_returns_none(session):
    assert await resolve_slug(session, "never-existed") is None


async def test_resolve_counts_hits(session):
    """命中要计数：没有计数就无法判断某条重定向是否还有真实流量。"""
    await record_slug_change(session, "old", "new")
    await session.commit()

    assert await resolve_slug(session, "old") == "new"
    assert await resolve_slug(session, "old") == "new"

    hits = (
        await session.execute(sa.select(Redirect.hit_count).where(Redirect.old_slug == "old"))
    ).scalar_one()
    assert hits == 2
    last_hit = (
        await session.execute(
            sa.select(Redirect.last_hit_at).where(Redirect.old_slug == "old")
        )
    ).scalar_one()
    assert last_hit is not None


async def test_repeated_record_does_not_duplicate(session):
    """同一 old_slug 反复记录只能有一条（uq_redirects_old_slug 的语义）。"""
    await record_slug_change(session, "old", "new1")
    await record_slug_change(session, "old", "new2")
    await session.commit()

    rows = (await session.execute(sa.select(Redirect))).scalars().all()
    assert len(rows) == 1
    assert rows[0].new_slug == "new2"
