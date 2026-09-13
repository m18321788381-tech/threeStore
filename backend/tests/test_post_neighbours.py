"""相邻文章（上一篇 / 下一篇）的回归测试（SQLite 内存库，不依赖 PostgreSQL）。

为什么需要这一层：
    这段查询原先内联在文章详情端点里，**无法被单测覆盖**，而它有一个真实缺陷：
    只用严格的 `published_at < / >` 比较、没有 tie-break，于是**同一时刻发布的两篇
    文章会互相看不见**——「下一篇」直接把另一篇跳过去，甚至两篇都显示「没有了」。
    个人博客一天发两篇（甚至同一次批量发布）并不罕见，所以这是会真实发生的 bug，
    而且它不报错，只是少一条链接。

    修复后全序为 `(published_at DESC, id DESC)`，id 作为兜底排序键。
    本文件钉住四个语义：
      ① 时间不同 → 按时间排；
      ② 时间相同 → 按 id 排，且**互相可见**（原缺陷的直接反例）；
      ③ 非已发布文章不参与；
      ④ 首尾两端返回 None。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.enums import PostStatus
from app.models.post import Post
from app.services.neighbours import find_neighbours

AUTHOR_ID = uuid.UUID("00000000-0000-0000-0000-0000000000aa")


@pytest.fixture
async def session():
    """独立内存库会话，每个用例一张干净的 posts 表。

    只建 posts 一张表：`find_neighbours` 的查询只取 (id, slug, title) 三列，
    不触发 author/category 的 joined 预加载，因此无需 users / categories 表。
    外键在 SQLite 下默认不强制，引用未建表不会导致 INSERT 失败。
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,  # 内存库必须复用同一连接，否则各连接看到的库不同
    )
    async with engine.begin() as conn:
        await conn.run_sync(Post.__table__.create)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _add(
    session,
    slug: str,
    published_at: datetime | None,
    *,
    status: int = PostStatus.PUBLISHED,
    post_id: uuid.UUID | None = None,
) -> Post:
    post = Post(
        id=post_id or uuid.uuid4(),
        author_id=AUTHOR_ID,
        title=slug,
        slug=slug,
        published_at=published_at,
        status=status,
    )
    session.add(post)
    await session.commit()
    return post


def _t(hour: int) -> datetime:
    return datetime(2026, 9, 13, hour, 0, tzinfo=timezone.utc)


async def _slugs(session, post) -> tuple[str | None, str | None]:
    prev, next_ = await find_neighbours(session, post)
    return (prev["slug"] if prev else None, next_["slug"] if next_ else None)


async def test_orders_by_time_when_timestamps_differ(session):
    a = await _add(session, "a", _t(10))
    b = await _add(session, "b", _t(11))
    c = await _add(session, "c", _t(12))

    assert await _slugs(session, b) == ("a", "c")
    # 首尾两端各自只有一侧
    assert await _slugs(session, a) == (None, "b")
    assert await _slugs(session, c) == ("b", None)


async def test_same_timestamp_posts_still_see_each_other(session):
    """原缺陷的直接反例：同一时刻的两篇必须互相可见，而不是双双为空。

    修复前：两篇的 prev / next 全是 None（严格比较排除了相等时刻），
    两篇在站点里彻底断开。
    """
    early_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    late_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    x = await _add(session, "x", _t(10), post_id=early_id)
    y = await _add(session, "y", _t(10), post_id=late_id)

    # 同一时刻下按 id 排：id 小的在前，id 大的在后，形成一条不断的链
    assert await _slugs(session, x) == (None, "y")
    assert await _slugs(session, y) == ("x", None)


async def test_same_timestamp_in_the_middle_of_a_timeline(session):
    """同日多篇夹在其它文章之间：前后都要接得上，不能断链。"""
    await _add(session, "older", _t(9))
    m1 = await _add(
        session, "m1", _t(10), post_id=uuid.UUID("00000000-0000-0000-0000-00000000000a")
    )
    m2 = await _add(
        session, "m2", _t(10), post_id=uuid.UUID("00000000-0000-0000-0000-00000000000b")
    )
    await _add(session, "newer", _t(11))

    assert await _slugs(session, m1) == ("older", "m2")
    assert await _slugs(session, m2) == ("m1", "newer")


async def test_unpublished_posts_are_ignored(session):
    a = await _add(session, "a", _t(10))
    await _add(session, "draft", _t(11), status=PostStatus.DRAFT)
    await _add(session, "archived", _t(12), status=PostStatus.ARCHIVED)

    assert await _slugs(session, a) == (None, None)


async def test_ref_returns_real_id_not_slug(session):
    """历史 bug：RefOut.id 曾被赋成 slug。前端用 id 做 key 或跳转就会拿到 slug。"""
    a = await _add(session, "a", _t(10))
    b = await _add(session, "b", _t(11))

    prev, _ = await find_neighbours(session, b)
    assert prev is not None
    assert prev["id"] == str(a.id)
    assert prev["id"] != prev["slug"]
