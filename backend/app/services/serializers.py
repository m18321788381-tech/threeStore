"""ORM -> API 字典的显式序列化。

显式转换而非 model_validate(orm) 的原因：嵌套模型（category/tags/author）
来自不同 ORM 对象，显式构造更可控，也顺带完成 UUID->str 转换。
"""
from __future__ import annotations

from app.models.category import Category
from app.models.post import Post
from app.models.tag import Tag


def ref_out(obj) -> dict | None:
    if obj is None:
        return None
    return {"id": str(obj.id), "name": getattr(obj, "name", ""), "slug": getattr(obj, "slug", "")}


def author_out(user) -> dict | None:
    if user is None:
        return None
    return {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name or user.username,
        "avatar": user.avatar or "",
    }


def post_list_item(post: Post, comment_count: int = 0) -> dict:
    return {
        "id": str(post.id),
        "title": post.title,
        "slug": post.slug,
        "summary": post.summary or "",
        "cover_url": post.cover_url or "",
        "status": post.status,
        "view_count": post.view_count or 0,
        "reading_time": post.reading_time or 1,
        "published_at": post.published_at,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "category": ref_out(post.category),
        "tags": [ref_out(t) for t in (post.tags or [])],
        "author": author_out(post.author),
        "comment_count": comment_count,
    }


def post_detail(post: Post, toc=None, prev=None, next_=None, comment_count: int = 0) -> dict:
    data = post_list_item(post, comment_count=comment_count)
    data.update(
        {
            "content_md": post.content_md or "",
            "content_html": post.content_html or "",
            "toc": toc or [],
            "prev": prev,
            "next": next_,
        }
    )
    return data


def category_out(cat: Category, post_count: int = 0) -> dict:
    return {
        "id": str(cat.id),
        "name": cat.name,
        "slug": cat.slug,
        "description": cat.description or "",
        "parent_id": str(cat.parent_id) if cat.parent_id else None,
        "post_count": post_count,
    }


def tag_out(tag: Tag, post_count: int = 0) -> dict:
    return {
        "id": str(tag.id),
        "name": tag.name,
        "slug": tag.slug,
        "post_count": post_count,
    }
