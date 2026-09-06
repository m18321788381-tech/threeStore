"""评论：公开发表/树状列表 + 博主审核管理。

访客评论默认 pending（审核后展示）；博主评论自动 approved。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    Pagination,
    get_client_ip,
    get_current_admin,
    optional_user,
    pagination_params,
)
from app.core.enums import CommentStatus, PostStatus
from app.db.session import get_db
from app.models.comment import Comment
from app.models.post import Post
from app.schemas import CommentCreate, CommentUpdate, ok, paginate
from app.services.comments import build_tree, validate_comment

# 挂在 /posts 下：GET|POST /api/v1/posts/{slug}/comments
post_comments_router = APIRouter(prefix="/posts", tags=["comments"])
# 后台管理：/api/v1/comments
router = APIRouter(prefix="/comments", tags=["comments"])


async def _get_published_post(session: AsyncSession, slug: str) -> Post:
    post = (
        await session.execute(
            select(Post).where(Post.slug == slug, Post.status == PostStatus.PUBLISHED)
        )
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在或未发布")
    return post


@post_comments_router.get("/{slug}/comments")
async def list_comments(
    slug: str,
    page_params: Pagination = Depends(pagination_params),
    session: AsyncSession = Depends(get_db),
):
    """一级评论分页（每页 N 条顶级评论，回复随附）。"""
    post = await _get_published_post(session, slug)

    # 1) 先取当页的一级评论（已通过）
    roots = (
        await session.execute(
            select(Comment)
            .where(
                Comment.post_id == post.id,
                Comment.status == CommentStatus.APPROVED,
                Comment.parent_id.is_(None),
            )
            .order_by(Comment.is_pinned.desc(), Comment.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
    ).scalars().all()

    total = (
        await session.execute(
            select(func.count(Comment.id)).where(
                Comment.post_id == post.id,
                Comment.status == CommentStatus.APPROVED,
                Comment.parent_id.is_(None),
            )
        )
    ).scalar_one()

    root_ids = [c.id for c in roots]
    if not root_ids:
        return ok(paginate([], total, page_params.page, page_params.page_size))

    # 2) 一次性取出这些一级评论下的全部后代（递归 CTE）
    cte = (
        select(Comment.id)
        .where(Comment.parent_id.in_(root_ids), Comment.status == CommentStatus.APPROVED)
        .cte(name="comment_tree", recursive=True)
    )
    child = cte.alias("c")
    descendants = cte.union_all(
        select(Comment.id).where(
            Comment.parent_id == child.c.id, Comment.status == CommentStatus.APPROVED
        )
    )
    tree_ids = (
        await session.execute(select(descendants.c.id))
    ).scalars().all()

    children = (
        (
            await session.execute(select(Comment).where(Comment.id.in_(tree_ids)))
        ).scalars().all()
        if tree_ids
        else []
    )

    tree = build_tree(list(roots) + list(children))
    return ok(
        {
            "items": tree,
            "total": total,
            "page": page_params.page,
            "page_size": page_params.page_size,
            "pages": (total + page_params.page_size - 1) // page_params.page_size
            if page_params.page_size
            else 0,
        }
    )


@post_comments_router.post("/{slug}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    slug: str,
    payload: CommentCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
    user=Depends(optional_user),
):
    post = await _get_published_post(session, slug)
    ip = get_client_ip(request)

    # 博主评论跳过部分限制，直接通过
    is_author_comment = user is not None and user.role == 0
    if not is_author_comment:
        validate_comment(payload.content, ip)

    parent = None
    if payload.parent_id:
        try:
            parent = await session.get(Comment, uuid.UUID(payload.parent_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="parent_id 非法")
        if parent is None or parent.post_id != post.id:
            raise HTTPException(status_code=400, detail="父评论不存在")

    comment = Comment(
        post_id=post.id,
        parent_id=parent.id if parent else None,
        author_name=(payload.author_name or "匿名访客").strip()[:50],
        author_email=(payload.author_email or "").strip(),
        author_site=(payload.author_site or "").strip(),
        content=payload.content.strip(),
        ip_address=ip,
        user_agent=request.headers.get("user-agent", "")[:500],
        status=CommentStatus.APPROVED if is_author_comment else CommentStatus.PENDING,
        is_author=is_author_comment,
    )
    session.add(comment)
    await session.commit()
    await session.refresh(comment)

    message = "评论已发布" if is_author_comment else "评论已提交，审核通过后展示"
    return ok({"id": str(comment.id), "status": comment.status}, message=message)


# ------------------------------------------------------------- 后台管理 ---
@router.get("")
async def admin_list_comments(
    page_params: Pagination = Depends(pagination_params),
    status_filter: int | None = Query(None, alias="status", ge=0, le=3),
    keyword: str | None = Query(None),
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    query = select(Comment).options(selectinload(Comment.post))
    if status_filter is not None:
        query = query.where(Comment.status == status_filter)
    if keyword:
        query = query.where(Comment.content.ilike(f"%{keyword}%"))

    count_query = select(func.count(Comment.id))
    if status_filter is not None:
        count_query = count_query.where(Comment.status == status_filter)
    if keyword:
        count_query = count_query.where(Comment.content.ilike(f"%{keyword}%"))
    total = (await session.execute(count_query)).scalar_one()

    rows = (
        await session.execute(
            query.order_by(Comment.created_at.desc())
            .offset(page_params.offset)
            .limit(page_params.page_size)
        )
    ).scalars().all()

    items = [
        {
            "id": str(c.id),
            "author_name": c.author_name,
            "author_site": c.author_site,
            "author_email": c.author_email,
            "content": c.content,
            "created_at": c.created_at,
            "parent_id": str(c.parent_id) if c.parent_id else None,
            "is_author": c.is_author,
            "is_pinned": c.is_pinned,
            "status": c.status,
            "ip_address": c.ip_address,
            "post_slug": c.post.slug if c.post else "",
            "post_title": c.post.title if c.post else "",
            "replies": [],
        }
        for c in rows
    ]
    return ok(paginate(items, total, page_params.page, page_params.page_size))


@router.patch("/{comment_id}")
async def update_comment(
    comment_id: str,
    payload: CommentUpdate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        comment = await session.get(Comment, uuid.UUID(comment_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 ID")
    if comment is None:
        raise HTTPException(status_code=404, detail="评论不存在")

    if payload.content is not None:
        comment.content = payload.content
    if payload.status is not None:
        if payload.status not in [s.value for s in CommentStatus]:
            raise HTTPException(status_code=400, detail="非法状态")
        comment.status = payload.status
    if payload.is_pinned is not None:
        comment.is_pinned = payload.is_pinned
    await session.commit()
    return ok({"id": str(comment.id), "status": comment.status}, message="已更新")


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: str,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        comment = await session.get(Comment, uuid.UUID(comment_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 ID")
    if comment is None:
        raise HTTPException(status_code=404, detail="评论不存在")
    await session.delete(comment)  # 子回复由 FK CASCADE 清理
    await session.commit()
    return ok({"id": comment_id}, message="已删除")


@router.get("/stats/summary")
async def comment_stats(
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    pending = (
        await session.execute(
            select(func.count(Comment.id)).where(
                Comment.status == CommentStatus.PENDING
            )
        )
    ).scalar_one()
    week_ago = datetime.now(tz=timezone.utc) - timedelta(days=7)
    recent = (
        await session.execute(
            select(func.count(Comment.id)).where(Comment.created_at >= week_ago)
        )
    ).scalar_one()
    approved = (
        await session.execute(
            select(func.count(Comment.id)).where(
                Comment.status == CommentStatus.APPROVED
            )
        )
    ).scalar_one()
    spam = (
        await session.execute(
            select(func.count(Comment.id)).where(Comment.status == CommentStatus.SPAM)
        )
    ).scalar_one()
    return ok(
        {
            "pending": pending,
            "approved": approved,
            "spam": spam,
            "last_7d": recent,
        }
    )


__all__ = ["router", "post_comments_router"]
