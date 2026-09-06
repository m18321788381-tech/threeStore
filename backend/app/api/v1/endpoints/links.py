"""数字花园：双向链接查询与知识图谱数据。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PostStatus
from app.db.session import get_db
from app.models.post import Post
from app.schemas import ok
from app.services.links import get_backlinks, get_graph, get_outbound

# 挂在 /posts 下：GET /api/v1/posts/{slug}/links
post_links_router = APIRouter(prefix="/posts", tags=["garden"])
garden_router = APIRouter(prefix="/garden", tags=["garden"])


@post_links_router.get("/{slug}/links")
async def post_links(slug: str, session: AsyncSession = Depends(get_db)):
    post = (
        await session.execute(
            select(Post.id).where(Post.slug == slug, Post.status == PostStatus.PUBLISHED)
        )
    ).first()
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")

    return ok(
        {
            "outbound": await get_outbound(session, post[0]),
            "backlinks": await get_backlinks(session, post[0]),
        }
    )


@garden_router.get("/graph")
async def graph(session: AsyncSession = Depends(get_db)):
    return ok(await get_graph(session))


__all__ = ["post_links_router", "garden_router"]
