"""RSS / Sitemap 渲染与可选缓存。

- `render_*`：直接查库生成（无 Redis 时的回退路径）。
- `get_*`：优先读 Redis 缓存，未命中再渲染并回填。
- `invalidate_seo_cache()`：内容变更后**同步删除**缓存键，让 sitemap/feed 立即反映最新状态。

关于 worker：仓库内**没有 worker 进程**（无 celery / apscheduler，
docker-compose 仅 db / backend / frontend / nginx 四服务）。
因此本模块不再依赖「通知 worker 刷新」这条路——那条路的订阅者从来不存在，
导致发文后 sitemap/feed 仍命中旧缓存，最长滞后 SEO_CACHE_TTL（默认 3600 秒）。
现在改为直接删键，立即生效且无外部依赖。

`publish()` 仍保留在失效流程里：将来若真的引入预热进程（或要接 CDN 刷新钩子），
订阅方能直接工作，不必再改这里。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import (
    CACHE_KEYS,
    INVALIDATE_CHANNEL,
    cache_delete,
    cache_get,
    cache_set,
    publish,
)
from app.core.config import settings
from app.core.enums import PostStatus
from app.models.category import Category
from app.models.post import Post
from app.models.tag import Tag, post_tags
from app.services.feed import RSS_FEED_LIMIT, build_feed, build_sitemap


async def render_feed(session: AsyncSession) -> str:
    rows = (
        await session.execute(
            select(Post)
            .options(selectinload(Post.tags), selectinload(Post.author))
            .where(Post.status == PostStatus.PUBLISHED)
            .order_by(Post.published_at.desc())
            .limit(RSS_FEED_LIMIT)
        )
    ).scalars().all()
    items = [
        {
            "title": p.title,
            "slug": p.slug,
            "summary": p.summary or "",
            # 全文：RSS 只给摘要会迫使读者跳站，技术博客读者普遍预期在阅读器内读完
            "content_html": p.content_html or "",
            "published_at": p.published_at,
            "author": (p.author.display_name if p.author else settings.SITE_AUTHOR),
            "categories": [t.name for t in (p.tags or [])],
        }
        for p in rows
    ]
    return build_feed(items)


async def render_sitemap(session: AsyncSession) -> str:
    """生成 sitemap。

    过滤规则（这三条都是「不这么做就会给搜索引擎矛盾信号」）：
    - 只含**已发布**文章；
    - **排除 `noindex` 文章**——既然声明不收录，就不该同时出现在 sitemap 里；
    - 标签/分类页**只保留真有已发布文章**的，避免产出大量空聚合页。
    """
    post_rows = (
        await session.execute(
            select(Post.slug, Post.published_at, Post.updated_at).where(
                Post.status == PostStatus.PUBLISHED,
                Post.noindex.is_(False),
            )
        )
    ).all()
    posts = [{"slug": s, "published_at": p, "updated_at": u} for s, p, u in post_rows]

    tag_rows = (
        await session.execute(
            select(Tag.slug, Tag.updated_at)
            .join(post_tags, post_tags.c.tag_id == Tag.id)
            .join(Post, Post.id == post_tags.c.post_id)
            .where(Post.status == PostStatus.PUBLISHED)
            .distinct()
        )
    ).all()
    tags = [{"slug": s, "updated_at": u} for s, u in tag_rows]

    category_rows = (
        await session.execute(
            select(Category.slug, Category.updated_at)
            .join(Post, Post.category_id == Category.id)
            .where(Post.status == PostStatus.PUBLISHED)
            .distinct()
        )
    ).all()
    categories = [{"slug": s, "updated_at": u} for s, u in category_rows]

    return build_sitemap(posts, tags, categories)


async def get_feed(session: AsyncSession) -> str:
    cached = await cache_get(CACHE_KEYS["feed"])
    if cached:
        return cached
    xml = await render_feed(session)
    await cache_set(CACHE_KEYS["feed"], xml, settings.SEO_CACHE_TTL)
    return xml


async def get_sitemap(session: AsyncSession) -> str:
    cached = await cache_get(CACHE_KEYS["sitemap"])
    if cached:
        return cached
    xml = await render_sitemap(session)
    await cache_set(CACHE_KEYS["sitemap"], xml, settings.SEO_CACHE_TTL)
    return xml


async def invalidate_seo_cache() -> None:
    """内容变更后失效 SEO 产物缓存。

    发文 / 改文 / 改状态 / 删文都会调用它（见 endpoints/posts.py）。
    """
    await cache_delete(*CACHE_KEYS.values())
    await publish(INVALIDATE_CHANNEL, "changed")


__all__ = [
    "get_feed",
    "get_sitemap",
    "invalidate_seo_cache",
    "render_feed",
    "render_sitemap",
]
