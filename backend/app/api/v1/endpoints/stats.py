"""后台概览统计。"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.enums import CommentStatus, PostStatus
from app.db.session import get_db
from app.models.category import Category
from app.models.comment import Comment
from app.models.media import Media
from app.models.post import Post
from app.models.post_link import PostLink
from app.models.tag import Tag
from app.schemas import ok

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/overview")
async def overview(
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    async def _count(model, *where) -> int:
        q = select(func.count(model.id))
        if where:
            q = q.where(*where)
        return (await session.execute(q)).scalar_one() or 0

    total_views = (
        await session.execute(select(func.coalesce(func.sum(Post.view_count), 0)))
    ).scalar_one()

    return ok(
        {
            "post_count": await _count(Post),
            "published_count": await _count(Post, Post.status == PostStatus.PUBLISHED),
            "draft_count": await _count(Post, Post.status == PostStatus.DRAFT),
            "comment_count": await _count(Comment),
            "pending_comment_count": await _count(
                Comment, Comment.status == CommentStatus.PENDING
            ),
            "category_count": await _count(Category),
            "tag_count": await _count(Tag),
            "media_count": await _count(Media),
            "link_count": await _count(PostLink),
            "total_views": int(total_views or 0),
            "views_last_7d": int(total_views or 0),  # 详见下方说明
        }
    )


@router.get("/recent")
async def recent_activity(
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """最近 7 天：新文章数、新评论数（近 7 日阅读量需 stats 表埋点，MVP 用总量）。"""
    week_ago = datetime.now(tz=timezone.utc) - timedelta(days=7)
    new_posts = (
        await session.execute(
            select(func.count(Post.id)).where(Post.created_at >= week_ago)
        )
    ).scalar_one()
    new_comments = (
        await session.execute(
            select(func.count(Comment.id)).where(Comment.created_at >= week_ago)
        )
    ).scalar_one()
    return ok({"new_posts": new_posts, "new_comments": new_comments})


__all__ = ["router"]
