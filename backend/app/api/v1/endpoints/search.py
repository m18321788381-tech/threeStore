"""全文搜索：标题 + 正文（DB ILIKE，预留 MeiliSearch 替换点）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Pagination, pagination_params
from app.core.enums import PostStatus
from app.db.session import get_db
from app.models.post import Post
from app.schemas import ok, paginate
from app.services.serializers import post_list_item

router = APIRouter(tags=["search"])


@router.get("/search")
async def search(
    q: str = Query(..., min_length=1, max_length=100),
    page_params: Pagination = Depends(pagination_params),
    session: AsyncSession = Depends(get_db),
):
    keyword = f"%{q.strip()}%"
    where = (
        Post.status == PostStatus.PUBLISHED,
        or_(Post.title.ilike(keyword), Post.content_md.ilike(keyword), Post.summary.ilike(keyword)),
    )

    total = (
        await session.execute(select(func.count(Post.id)).where(*where))
    ).scalar_one()

    rows = (
        await session.execute(
            select(Post)
            .options(
                selectinload(Post.tags),
                selectinload(Post.category),
                selectinload(Post.author),
            )
            .where(*where)
            .order_by(Post.published_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
    ).scalars().all()

    items = [post_list_item(p) for p in rows]
    return ok(
        {
            "keyword": q,
            **paginate(items, total, page_params.page, page_params.page_size),
        }
    )


__all__ = ["router"]
