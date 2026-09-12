"""数字花园：[[双向链接]] 的解析与 post_links 关系维护。

保存流程（设计文档 §5.7.2）：
    editor 保存 -> 提取 content_md 中的 [[...]]
                -> 解析为 (source_id, target_id)
                -> 事务内删除旧关系 -> 批量 upsert 新关系
                -> 更新 content_html（含 wiki-link 锚点）
"""
from __future__ import annotations

import re
import uuid
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.media import Media
from app.models.post import Post
from app.models.post_link import PostLink
from app.services.markdown import extract_wikilinks, render_markdown


async def build_wiki_resolver(
    session: AsyncSession, source_post_id: uuid.UUID | None = None
):
    """返回一个 resolver：笔记名 -> slug。

    匹配优先级：精确 slug > 精确标题 > 大小写不敏感标题 > 首个包含匹配。
    仅对**已发布**文章建立关系（草稿不进图谱，避免泄露未公开内容）。
    自引用（文章引用自己）会被忽略。
    """
    rows = await session.execute(
        select(Post.id, Post.slug, Post.title).where(Post.status == 1)
    )
    posts = rows.all()

    by_slug = {p.slug: p.slug for p in posts}
    by_title = {p.title: p.slug for p in posts}
    by_title_lower = {p.title.lower(): p.slug for p in posts}
    contains: list[tuple[str, str]] = [(p.title, p.slug) for p in posts]

    def resolver(name: str) -> str | None:
        key = (name or "").strip()
        if not key:
            return None
        if key in by_slug:
            slug = by_slug[key]
        elif key in by_title:
            slug = by_title[key]
        elif key.lower() in by_title_lower:
            slug = by_title_lower[key.lower()]
        else:
            matched = [(t, s) for t, s in contains if key.lower() in t.lower()]
            if not matched:
                return None
            slug = matched[0][1]
        # 忽略自引用
        if source_post_id is not None:
            for p in posts:
                if p.slug == slug and p.id == source_post_id:
                    return None
        return slug

    return resolver, {p.slug: p.id for p in posts}


async def load_media_meta(
    session: AsyncSession, md_text: str
) -> dict[str, tuple[int, int, str]]:
    """收集正文里引用到的站内媒体，返回 {filename: (width, height, alt)}。

    只查这一篇真正用到的那几张图（一次 IN 查询），不随全站媒体总量增长。
    结果交给 markdown 渲染器注入到 <img> 上，用于消除图片加载的布局偏移（CLS）。
    """
    prefix = settings.MEDIA_URL.rstrip("/")
    if not prefix or not md_text:
        return {}

    names = set(
        re.findall(re.escape(prefix) + r"/([A-Za-z0-9._-]+)", md_text)
    )
    if not names:
        return {}

    rows = (
        await session.execute(
            select(Media.filename, Media.width, Media.height, Media.alt).where(
                Media.filename.in_(names)
            )
        )
    ).all()
    return {name: (w or 0, h or 0, a or "") for name, w, h, a in rows}


async def render_post_content(
    session: AsyncSession,
    post: Post,
) -> tuple[str, list[dict], int]:
    """渲染文章正文（含 wiki 链接与站内图片尺寸），返回 (html, toc, reading_time)。"""
    resolver, slug_to_id = await build_wiki_resolver(session, post.id)
    media_meta = await load_media_meta(session, post.content_md)
    result = render_markdown(post.content_md, resolver, media_meta)
    return result.html, [t.__dict__ for t in result.toc], result.reading_time


async def sync_post_links(session: AsyncSession, post: Post) -> list[uuid.UUID]:
    """解析并重建该文章的出链关系，返回被引用文章的 id 列表。"""
    resolver, slug_to_id = await build_wiki_resolver(session, post.id)
    targets: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()

    for name, _display in extract_wikilinks(post.content_md):
        slug = resolver(name)
        if not slug:
            continue
        target_id = slug_to_id.get(slug)
        if target_id is None or target_id == post.id:
            continue
        if target_id not in seen:
            seen.add(target_id)
            targets.append(target_id)

    await session.execute(
        delete(PostLink).where(PostLink.source_post_id == post.id)
    )
    if targets:
        session.add_all(
            [
                PostLink(source_post_id=post.id, target_post_id=tid)
                for tid in targets
            ]
        )
    await session.flush()
    return targets


async def get_outbound(session: AsyncSession, post_id: uuid.UUID) -> list[dict]:
    rows = await session.execute(
        select(Post.slug, Post.title, Post.summary)
        .join(PostLink, PostLink.target_post_id == Post.id)
        .where(PostLink.source_post_id == post_id, Post.status == 1)
    )
    return [
        {"slug": s, "title": t, "summary": sm or ""} for s, t, sm in rows.all()
    ]


async def get_backlinks(session: AsyncSession, post_id: uuid.UUID) -> list[dict]:
    """反向引用：谁引用了本文——数字花园的核心价值。"""
    rows = await session.execute(
        select(Post.slug, Post.title, Post.summary, Post.published_at)
        .join(PostLink, PostLink.source_post_id == Post.id)
        .where(PostLink.target_post_id == post_id, Post.status == 1)
        .order_by(Post.published_at.desc())
    )
    return [
        {"slug": s, "title": t, "summary": sm or "", "published_at": p}
        for s, t, sm, p in rows.all()
    ]


async def get_graph(session: AsyncSession) -> dict:
    """知识图谱：仅已发布节点参与。"""
    posts = (
        await session.execute(
            select(Post.id, Post.slug, Post.title).where(Post.status == 1)
        )
    ).all()
    links = (
        await session.execute(
            select(PostLink.source_post_id, PostLink.target_post_id)
        )
    ).all()

    id_to_slug = {p.id: p.slug for p in posts}
    id_to_title = {p.id: p.title for p in posts}
    degree: dict[uuid.UUID, int] = {p.id: 0 for p in posts}

    edges = []
    for src, tgt in links:
        if src in id_to_slug and tgt in id_to_slug:
            edges.append(
                {"source": id_to_slug[src], "target": id_to_slug[tgt]}
            )
            degree[tgt] = degree.get(tgt, 0) + 1
            degree[src] = degree.get(src, 0) + 1

    nodes = [
        {
            "id": p.slug,
            "title": id_to_title[p.id],
            "degree": degree.get(p.id, 0),
        }
        for p in posts
    ]
    nodes.sort(key=lambda n: n["degree"], reverse=True)
    return {"nodes": nodes, "edges": edges}


def is_isolated(node_slug: str, edges: Sequence[dict]) -> bool:
    return not any(
        e["source"] == node_slug or e["target"] == node_slug for e in edges
    )
