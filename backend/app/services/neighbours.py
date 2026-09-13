"""相邻文章（上一篇 / 下一篇）查询。

为什么单独成模块：这段逻辑原先内联在 `endpoints/posts.py` 的详情接口里，
因此**无法被单测覆盖**——而它恰好有一个真实缺陷：只用严格的
`published_at < / >` 比较，没有 tie-break，导致同一天（乃至同一秒）发布的两篇文章
会因为「时刻完全相等」而互相看不见，「下一篇」直接跳过另一篇。
个人博客同日多篇并不罕见，所以这个缺陷是会真实发生的。

抽出来之后，`tests/test_post_neighbours.py` 可以用 SQLite 内存库直接钉住语义。
"""
from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PostStatus
from app.models.post import Post


def _ref(row_) -> dict | None:
    """把 (id, slug, title) 装配成 RefOut。

    历史 bug 提醒：曾经查询只取 (slug, title)，却把 id 与 slug 都赋成 row_[0]，
    导致 `RefOut.id` 实际返回 slug。这里按 (id, slug, title) 三列取值。
    """
    if not row_:
        return None
    return {"id": str(row_[0]), "slug": row_[1], "name": row_[2]}


async def find_neighbours(
    session: AsyncSession, post: Post
) -> tuple[dict | None, dict | None]:
    """返回 (prev, next)。

    全序约定：`(published_at DESC, id DESC)`，id 作为 tie-break 兜底，
    保证任意两篇不同文章之间都有确定的前后关系，不会互相跳过。

    - prev = 该顺序中紧邻当前文章的**前一条**（更旧，或同一时刻 id 更小）
    - next = 紧邻的**后一条**（更新，或同一时刻 id 更大）
    """
    published_at = post.published_at or post.created_at

    prev_row = (
        await session.execute(
            select(Post.id, Post.slug, Post.title)
            .where(
                Post.status == PostStatus.PUBLISHED,
                or_(
                    Post.published_at < published_at,
                    and_(Post.published_at == published_at, Post.id < post.id),
                ),
            )
            .order_by(Post.published_at.desc(), Post.id.desc())
            .limit(1)
        )
    ).first()

    next_row = (
        await session.execute(
            select(Post.id, Post.slug, Post.title)
            .where(
                Post.status == PostStatus.PUBLISHED,
                or_(
                    Post.published_at > published_at,
                    and_(Post.published_at == published_at, Post.id > post.id),
                ),
            )
            .order_by(Post.published_at.asc(), Post.id.asc())
            .limit(1)
        )
    ).first()

    return _ref(prev_row), _ref(next_row)


__all__ = ["find_neighbours"]
