"""文章：公开列表/详情/归档 + 博主 CRUD/发布 + 阅读量计数。

渲染分工（设计文档 §3.3）：保存时渲染 content_html + toc 落库，
读取详情零渲染成本；[[双向链接]] 关系同样在保存时同步。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Pagination, get_current_admin, optional_user, pagination_params
from app.core.enums import CommentStatus, PostStatus
from app.db.session import get_db
from app.models.category import Category
from app.models.comment import Comment
from app.models.media import PostStat
from app.models.post import Post
from app.models.tag import Tag
from app.schemas import PostCreate, PostUpdate, ok, paginate
from app.services.links import render_post_content, sync_post_links
from app.services.redirects import record_slug_change
from app.services.serializers import post_detail, post_list_item
from app.services.seo import notify_seo_changed
from app.services.slug import slugify_title, unique_slug

router = APIRouter(prefix="/posts", tags=["posts"])


def _comment_count_subquery():
    """已通过评论数（列表页展示用）。"""
    return (
        select(func.count(Comment.id))
        .where(Comment.post_id == Post.id, Comment.status == CommentStatus.APPROVED)
        .scalar_subquery()
    )


def _base_query():
    return (
        select(Post, _comment_count_subquery().label("comment_count"))
        .options(
            selectinload(Post.tags),
            selectinload(Post.category),
            selectinload(Post.author),
        )
    )


def _safe_uuid(value: str | None, field: str) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail=f"{field} 不是合法的 ID")


def _parse_toc(raw: str) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (ValueError, TypeError):
        return []


# ------------------------------------------------------------------ 公开 ---
@router.get("")
async def list_posts(
    page_params: Pagination = Depends(pagination_params),
    category: str | None = Query(None, description="分类 slug"),
    tag: str | None = Query(None, description="标签 slug"),
    sort: str = Query("newest", pattern="^(newest|oldest|popular)$"),
    status_filter: int | None = Query(None, alias="status", ge=0, le=2),
    session: AsyncSession = Depends(get_db),
    user=Depends(optional_user),
):
    query = _base_query()

    is_admin = user is not None and user.role == 0
    if status_filter is not None and is_admin:
        query = query.where(Post.status == status_filter)
    else:
        query = query.where(Post.status == PostStatus.PUBLISHED)

    if category:
        query = query.join(Category, Category.id == Post.category_id).where(
            Category.slug == category
        )
    if tag:
        query = query.join(Post.tags).where(Tag.slug == tag)

    # 置顶文章始终最前，其余按所选排序。
    # 置顶只作用于列表页；归档页与 RSS 保持纯时序，避免「时间线错乱」的观感。
    secondary = {
        "oldest": (Post.published_at.asc(),),
        "popular": (Post.view_count.desc(), Post.published_at.desc()),
    }.get(sort, (Post.published_at.desc(),))
    query = query.order_by(Post.is_pinned.desc(), *secondary)

    total = (
        await session.execute(select(func.count()).select_from(query.subquery()))
    ).scalar_one()

    rows = (
        await session.execute(
            query.offset(page_params.offset).limit(page_params.page_size)
        )
    ).all()

    items = [post_list_item(row[0], comment_count=row[1] or 0) for row in rows]
    return ok(paginate(items, total, page_params.page, page_params.page_size))


@router.get("/archive")
async def archive(session: AsyncSession = Depends(get_db)):
    """按年月分组的归档时间线。"""
    rows = (
        await session.execute(
            select(Post.id, Post.title, Post.slug, Post.published_at)
            .where(Post.status == PostStatus.PUBLISHED)
            .order_by(Post.published_at.desc())
        )
    ).all()

    groups: dict[str, list[dict]] = {}
    for pid, title, slug, published in rows:
        if not published:
            continue
        key = published.strftime("%Y-%m")
        groups.setdefault(key, []).append(
            {
                "id": str(pid),
                "title": title,
                "slug": slug,
                "published_at": published,
                "day": published.strftime("%d"),
            }
        )

    return ok(
        {
            "groups": [
                {"year": key[:4], "month": key[5:7], "key": key, "items": items}
                for key, items in groups.items()
            ],
            "total": len(rows),
        }
    )


@router.get("/admin/{post_id}")
async def admin_get_post(
    post_id: str,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """后台编辑用：按 id 读取，草稿也能取到。必须在 /{slug} 之前注册。"""
    post = await session.get(Post, _safe_uuid(post_id, "post_id"))
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")
    return ok(post_detail(post, toc=_parse_toc(post.toc)))


@router.get("/{slug}")
async def get_post(slug: str, session: AsyncSession = Depends(get_db)):
    row = (
        await session.execute(
            _base_query().where(Post.slug == slug, Post.status == PostStatus.PUBLISHED)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文章不存在")

    post: Post = row[0]
    comment_count = row[1] or 0
    published_at = post.published_at or post.created_at

    prev_row = (
        await session.execute(
            select(Post.id, Post.slug, Post.title)
            .where(
                Post.status == PostStatus.PUBLISHED,
                Post.published_at < published_at,
            )
            .order_by(Post.published_at.desc())
            .limit(1)
        )
    ).first()
    next_row = (
        await session.execute(
            select(Post.id, Post.slug, Post.title)
            .where(
                Post.status == PostStatus.PUBLISHED,
                Post.published_at > published_at,
            )
            .order_by(Post.published_at.asc())
            .limit(1)
        )
    ).first()

    def _ref(row_) -> dict | None:
        """把 (id, slug, title) 装配成 RefOut。

        历史 bug：此前查询只取 (slug, title)，却把 id 与 slug 都赋成了 row_[0]，
        导致 `RefOut.id` 实际返回的是 slug。前端一旦用 prev.id 做 key 或跳转就会拿到 slug，
        故查询补上 Post.id，这里按 (id, slug, title) 三列取值。
        """
        if not row_:
            return None
        return {"id": str(row_[0]), "slug": row_[1], "name": row_[2]}

    return ok(
        post_detail(
            post,
            toc=_parse_toc(post.toc),
            prev=_ref(prev_row),
            next_=_ref(next_row),
            comment_count=comment_count,
        )
    )


@router.post("/{slug}/view")
async def increase_view(slug: str, session: AsyncSession = Depends(get_db)):
    """阅读量 +1（前端详情页挂载后调用，不阻塞正文渲染）。"""
    post = (
        await session.execute(select(Post).where(Post.slug == slug))
    ).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")

    post.view_count = (post.view_count or 0) + 1
    stat = (
        await session.execute(select(PostStat).where(PostStat.post_id == post.id))
    ).scalar_one_or_none()
    if stat is None:
        session.add(PostStat(post_id=post.id, view_count=post.view_count))
    else:
        stat.view_count = post.view_count
    await session.commit()
    return ok({"view_count": post.view_count})


# ------------------------------------------------------------------ 管理 ---
async def _assign_tags(session: AsyncSession, post: Post, tag_ids: list[str] | None):
    """整体替换文章的标签集合。

    AsyncSession 下给「未载入」的关系集合赋值会先懒加载旧值并抛 MissingGreenlet：
    pending（尚未 flush）的新文章直接赋值即可；已入库且集合未载入的先显式异步载入。
    """
    if tag_ids is None:
        return
    ids = []
    for raw in tag_ids:
        parsed = _safe_uuid(raw, "tag_ids")
        if parsed:
            ids.append(parsed)
    tags = (
        list(
            (
                await session.execute(select(Tag).where(Tag.id.in_(ids)))
            ).scalars()
        )
        if ids
        else []
    )
    if inspect(post).persistent and "tags" not in post.__dict__:
        await session.refresh(post, attribute_names=["tags"])
    post.tags = tags


async def _render_and_sync(session: AsyncSession, post: Post) -> None:
    """渲染正文 -> content_html/toc/reading_time，并重建双向链接关系。"""
    html, toc, reading_time = await render_post_content(session, post)
    post.content_html = html
    post.toc = json.dumps(toc, ensure_ascii=False)
    post.reading_time = reading_time
    await session.flush()
    await sync_post_links(session, post)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostCreate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    base_slug = slugify_title(payload.slug or payload.title)
    used = set((await session.execute(select(Post.slug))).scalars())
    slug = unique_slug(base_slug, used)

    post = Post(
        author_id=admin.id,
        title=payload.title,
        slug=slug,
        summary=payload.summary or "",
        content_md=payload.content_md or "",
        cover_url=payload.cover_url or "",
        canonical_url=(payload.canonical_url or "").strip(),
        noindex=bool(payload.noindex),
        is_pinned=bool(payload.is_pinned),
        category_id=_safe_uuid(payload.category_id, "category_id"),
        status=payload.status,
    )
    if post.status == PostStatus.PUBLISHED:
        post.published_at = datetime.now(tz=timezone.utc)

    session.add(post)
    # 标签在 flush 之前挂载：pending 态赋值不触发懒加载
    await _assign_tags(session, post, payload.tag_ids)
    await session.flush()
    await _render_and_sync(session, post)

    await session.commit()
    await notify_seo_changed()
    return ok({"id": str(post.id), "slug": post.slug, "status": post.status})


@router.put("/{post_id}")
async def update_post(
    post_id: str,
    payload: PostUpdate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    post = await session.get(Post, _safe_uuid(post_id, "post_id"))
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")

    if payload.title is not None:
        post.title = payload.title
    if payload.slug is not None:
        new_slug = slugify_title(payload.slug)
        if new_slug != post.slug:
            exists = (
                await session.execute(
                    select(Post.id).where(Post.slug == new_slug, Post.id != post.id)
                )
            ).first()
            if exists:
                raise HTTPException(status_code=400, detail="slug 已被占用")
            # 记下 slug 变更：旧链接由 /redirects/resolve 301 到新地址，
            # 否则外链与搜索引擎里的旧 URL 会直接 404，已积累的权重白丢。
            await record_slug_change(session, post.slug, new_slug)
            post.slug = new_slug
    for field in ("summary", "content_md", "cover_url"):
        value = getattr(payload, field)
        if value is not None:
            setattr(post, field, value)
    if payload.canonical_url is not None:
        post.canonical_url = payload.canonical_url.strip()
    if payload.noindex is not None:
        post.noindex = payload.noindex
    if payload.is_pinned is not None:
        post.is_pinned = payload.is_pinned
    if payload.category_id is not None:
        post.category_id = _safe_uuid(payload.category_id, "category_id")
    if payload.tag_ids is not None:
        await _assign_tags(session, post, payload.tag_ids)
    if payload.status is not None:
        if (
            payload.status == PostStatus.PUBLISHED
            and post.status != PostStatus.PUBLISHED
        ):
            post.published_at = post.published_at or datetime.now(tz=timezone.utc)
        post.status = payload.status

    await session.flush()
    await _render_and_sync(session, post)
    await session.commit()
    await notify_seo_changed()
    return ok({"id": str(post.id), "slug": post.slug, "status": post.status})


@router.post("/{post_id}/publish")
async def publish_post(
    post_id: str,
    payload: dict,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    post = await session.get(Post, _safe_uuid(post_id, "post_id"))
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")

    new_status = int(payload.get("status", PostStatus.PUBLISHED))
    if new_status not in (
        PostStatus.DRAFT,
        PostStatus.PUBLISHED,
        PostStatus.ARCHIVED,
    ):
        raise HTTPException(status_code=400, detail="非法状态")

    if new_status == PostStatus.PUBLISHED and post.status != PostStatus.PUBLISHED:
        post.published_at = datetime.now(tz=timezone.utc)
    post.status = new_status
    await session.flush()
    await sync_post_links(session, post)  # 上线后草稿不参与图谱，需重建关系
    await session.commit()
    await notify_seo_changed()
    return ok({"id": str(post.id), "status": post.status})


@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    post = await session.get(Post, _safe_uuid(post_id, "post_id"))
    if post is None:
        raise HTTPException(status_code=404, detail="文章不存在")
    await session.delete(post)  # post_links / comments 由 FK CASCADE 清理
    await session.commit()
    await notify_seo_changed()
    return ok({"id": post_id}, message="已删除")


__all__ = ["router"]
