"""分类与标签：公开列表（含计数）+ 博主管理。"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.enums import PostStatus
from app.db.session import get_db
from app.models.category import Category
from app.models.post import Post
from app.models.tag import Tag, post_tags
from app.schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    TagCreate,
    TagUpdate,
    ok,
)
from app.services.serializers import category_out, tag_out
from app.services.slug import slugify_title, unique_slug

categories_router = APIRouter(prefix="/categories", tags=["categories"])
tags_router = APIRouter(prefix="/tags", tags=["tags"])


async def _tag_post_counts(session: AsyncSession) -> dict:
    """按标签统计已发布文章数。"""
    rows = await session.execute(
        select(post_tags.c.tag_id, func.count(Post.id))
        .select_from(Post)
        .join(post_tags, post_tags.c.post_id == Post.id)
        .where(Post.status == PostStatus.PUBLISHED)
        .group_by(post_tags.c.tag_id)
    )
    return {str(r[0]): r[1] for r in rows.all()}


# ------------------------------------------------------------- categories ---
@categories_router.get("")
async def list_categories(session: AsyncSession = Depends(get_db)):
    rows = await session.execute(
        select(Category, func.count(Post.id))
        .outerjoin(
            Post,
            (Post.category_id == Category.id) & (Post.status == PostStatus.PUBLISHED),
        )
        .group_by(Category.id)
        .order_by(Category.name)
    )
    items = [category_out(row[0], post_count=row[1] or 0) for row in rows.all()]
    return ok(items)


@categories_router.post("", status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    used = set((await session.execute(select(Category.slug))).scalars())
    slug = unique_slug(slugify_title(payload.slug or payload.name), used)
    cat = Category(
        name=payload.name,
        slug=slug,
        description=payload.description or "",
        parent_id=uuid.UUID(payload.parent_id) if payload.parent_id else None,
    )
    session.add(cat)
    await session.commit()
    await session.refresh(cat)
    return ok(category_out(cat), message="已创建")


@categories_router.put("/{category_id}")
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        cat = await session.get(Category, uuid.UUID(category_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 ID")
    if cat is None:
        raise HTTPException(status_code=404, detail="分类不存在")

    if payload.name is not None:
        cat.name = payload.name
    if payload.slug is not None:
        cat.slug = slugify_title(payload.slug)
    if payload.description is not None:
        cat.description = payload.description
    if payload.parent_id is not None:
        cat.parent_id = uuid.UUID(payload.parent_id) if payload.parent_id else None
    await session.commit()
    return ok(category_out(cat), message="已更新")


@categories_router.delete("/{category_id}")
async def delete_category(
    category_id: str,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        cat = await session.get(Category, uuid.UUID(category_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 ID")
    if cat is None:
        raise HTTPException(status_code=404, detail="分类不存在")
    # 文章回落到「未分类」由 FK ondelete=SET NULL 完成
    await session.delete(cat)
    await session.commit()
    return ok({"id": category_id}, message="已删除")


# ------------------------------------------------------------------- tags ---
@tags_router.get("")
async def list_tags(session: AsyncSession = Depends(get_db)):
    counts = await _tag_post_counts(session)
    rows = (await session.execute(select(Tag).order_by(Tag.name))).scalars().all()
    items = [tag_out(t, post_count=counts.get(str(t.id), 0)) for t in rows]
    return ok(items)


@tags_router.post("", status_code=status.HTTP_201_CREATED)
async def create_tag(
    payload: TagCreate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    used = set((await session.execute(select(Tag.slug))).scalars())
    slug = unique_slug(slugify_title(payload.slug or payload.name), used)
    tag = Tag(name=payload.name, slug=slug)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return ok(tag_out(tag), message="已创建")


@tags_router.put("/{tag_id}")
async def update_tag(
    tag_id: str,
    payload: TagUpdate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        tag = await session.get(Tag, uuid.UUID(tag_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 ID")
    if tag is None:
        raise HTTPException(status_code=404, detail="标签不存在")
    if payload.name is not None:
        tag.name = payload.name
    if payload.slug is not None:
        tag.slug = slugify_title(payload.slug)
    await session.commit()
    return ok(tag_out(tag), message="已更新")


@tags_router.delete("/{tag_id}")
async def delete_tag(
    tag_id: str,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        tag = await session.get(Tag, uuid.UUID(tag_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="非法 ID")
    if tag is None:
        raise HTTPException(status_code=404, detail="标签不存在")
    await session.delete(tag)
    await session.commit()
    return ok({"id": tag_id}, message="已删除")


__all__ = ["categories_router", "tags_router", "CategoryOut"]
