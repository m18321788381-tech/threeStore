"""RSS / Sitemap 渲染与可选缓存。

- render_*：直接查库生成（无 Redis 时的回退路径）。
- get_*：优先读 Redis 缓存，未命中再渲染并回填。
- refresh_seo_cache：worker 用——重算并写回缓存。
- notify_seo_changed：发文/改删后由后端 fire-and-forget 通知 worker 立即刷新。
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import (
    CACHE_KEYS,
    INVALIDATE_CHANNEL,
    cache_get,
    cache_set,
    publish,
)
from app.core.config import settings
from app.core.enums import PostStatus
from app.models.post import Post
from app.services.feed import build_feed, build_sitemap


async def render_feed(session: AsyncSession) -> str:
    rows = (
        await session.execute(
            select(Post)
            .options(selectinload(Post.tags), selectinload(Post.author))
            .where(Post.status == PostStatus.PUBLISHED)
            .order_by(Post.published_at.desc())
            .limit(50)
        )
    ).scalars().all()
    items = [
        {
            "title": p.title,
            "slug": p.slug,
            "summary": p.summary or "",
            "published_at": p.published_at,
            "author": (p.author.display_name if p.author else settings.SITE_AUTHOR),
            "categories": [t.name for t in (p.tags or [])],
        }
        for p in rows
    ]
    return build_feed(items)


async def render_sitemap(session: AsyncSession) -> str:
    rows = (
        await session.execute(
            select(Post.slug, Post.published_at, Post.updated_at).where(
                Post.status == PostStatus.PUBLISHED
            )
        )
    ).all()
    items = [{"slug": s, "published_at": p, "updated_at": u} for s, p, u in rows]
    return build_sitemap(items)


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


async def refresh_seo_cache(session: AsyncSession) -> dict:
    """worker 调用：重算并写回 Redis 缓存。"""
    feed = await render_feed(session)
    sitemap = await render_sitemap(session)
    await cache_set(CACHE_KEYS["feed"], feed, settings.SEO_CACHE_TTL)
    await cache_set(CACHE_KEYS["sitemap"], sitemap, settings.SEO_CACHE_TTL)
    return {"feed": len(feed), "sitemap": len(sitemap)}


async def notify_seo_changed() -> None:
    """内容变更后通知 worker 立即刷新；无 Redis 时为无操作。"""
    await publish(INVALIDATE_CHANNEL, "changed")
