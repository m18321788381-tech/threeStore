"""后台编辑器实时预览的回归测试（SQLite 内存库，不依赖 PostgreSQL）。

为什么需要这一层：
    编辑器的核心卖点是「预览即最终效果」——预览必须走**保存时那条渲染管线**。
    前端本地渲染（react-markdown + highlight.js）与服务端保存时的渲染
    （markdown-it + Pygments + 图注 + 图片尺寸注入 + [[链接]] 解析）是两套实现，
    作者会在预览里看到跟发布后不一样的正文。

    这个约束靠 `render_post_content` 复用 `render_markdown_preview` 来维持，
    而它是**代码层面**的约束：一旦有人只改其中一边（例如只在发布路径上加图注），
    两边立刻分叉，且不会报错、不会失败任何一个既有用例。所以断言必须把
    「逐字节相同」钉死。

同时覆盖预览链条上几个静默出错的点：
    - [[链接]] 必须像发布时一样解析成站内链接；
    - 正在编辑的文章引用自己必须被忽略；
    - 新建文章（还没有 id）不能崩；
    - 草稿不进图谱，预览也不能把草稿标题变成可点击链接；
    - 图注与图片尺寸注入在预览里同样生效。
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.enums import PostStatus
from app.models.media import Media
from app.models.post import Post
from app.services.links import render_markdown_preview, render_post_content

AUTHOR_ID = uuid.UUID("00000000-0000-0000-0000-0000000000aa")


@pytest.fixture
async def session():
    """独立内存库会话，只建本层真正会查的两张表。

    `build_wiki_resolver` 只读 posts，`load_media_meta` 只读 media，
    因此不需要 users / categories / post_links（SQLite 默认不强制外键）。
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,  # 内存库必须复用同一连接，否则各连接看到的库不同
    )
    async with engine.begin() as conn:
        await conn.run_sync(Post.__table__.create)
        await conn.run_sync(Media.__table__.create)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _add_post(
    session,
    slug: str,
    title: str,
    *,
    status: int = PostStatus.PUBLISHED,
    post_id: uuid.UUID | None = None,
) -> Post:
    post = Post(
        id=post_id or uuid.uuid4(),
        author_id=AUTHOR_ID,
        title=title,
        slug=slug,
        status=status,
    )
    session.add(post)
    await session.commit()
    return post


async def _add_media(
    session, filename: str, *, width: int = 800, height: int = 450, alt: str = ""
) -> Media:
    media = Media(
        filename=filename,
        url=f"/media/{filename}",
        width=width,
        height=height,
        alt=alt,
    )
    session.add(media)
    await session.commit()
    return media


# ------------------------------------------- 预览与发布必须是同一条渲染管线 ---
async def test_preview_html_equals_published_html(session):
    """同一个 Markdown，预览结果与发布结果必须逐字节相同。

    这是本文件最重要的一条：只要两边分叉（哪怕只差一个 <figcaption>），
    「所见即所得」的承诺就失效了，而作者很难自己发现。
    """
    await _add_post(session, "backend-arch", "后端架构设计")
    await _add_media(session, "diagram.png", width=1200, height=630, alt="架构图")
    post = await _add_post(session, "editor-guide", "编辑器指南")
    md = "\n".join(
        [
            "# 编辑器指南",
            "",
            "见 [[后端架构设计]] 与 [[还没写的笔记]]。",
            "",
            '![架构图](/media/diagram.png "后端分层")',
            "",
            "```python title=app.py {1}",
            "print('hi')",
            "```",
        ]
    )
    post.content_md = md
    await session.commit()

    preview_html, preview_toc, preview_time = await render_markdown_preview(
        session, md, post.id
    )
    published_html, published_toc, published_time = await render_post_content(session, post)

    assert preview_html == published_html
    assert preview_toc == published_toc
    assert preview_time == published_time


# ------------------------------------------------------------ [[链接]] 解析 ---
async def test_preview_resolves_wiki_link(session):
    target = await _add_post(session, "backend-arch", "后端架构设计")
    html_text, _, _ = await render_markdown_preview(session, "见 [[后端架构设计]]。", None)
    assert f'href="/posts/{target.slug}"' in html_text
    assert 'class="wiki-link"' in html_text


async def test_preview_marks_missing_wiki_target(session):
    """目标不存在 → 「待创建」标记，而不是一个坏链接。"""
    html_text, _, _ = await render_markdown_preview(session, "见 [[还没写的笔记]]。", None)
    assert "wiki-link--new" in html_text
    assert 'href="/posts/' not in html_text


async def test_preview_ignores_self_reference(session):
    """正在编辑的文章引用自己 → 预览里不能出现指向自己的链接。"""
    me = await _add_post(session, "editor-guide", "编辑器指南")
    html_text, _, _ = await render_markdown_preview(session, "回到 [[编辑器指南]]。", me.id)
    assert "wiki-link--new" in html_text

    # 同一段文字在别的文章里（post_id 不是自己）应当正常解析
    other = await _add_post(session, "other-post", "另一篇笔记")
    other_html, _, _ = await render_markdown_preview(
        session, "回到 [[编辑器指南]]。", other.id
    )
    assert f'href="/posts/{me.slug}"' in other_html


async def test_preview_without_post_id_still_resolves(session):
    """新建文章还没有 id：预览必须能跑，且不因缺 id 漏掉链接。"""
    await _add_post(session, "backend-arch", "后端架构设计")
    html_text, _, _ = await render_markdown_preview(session, "见 [[后端架构设计]]。", None)
    assert 'href="/posts/backend-arch"' in html_text


async def test_preview_does_not_link_draft_targets(session):
    """草稿不进图谱：预览也不能把草稿标题变成可点击链接（会泄露未公开内容）。"""
    await _add_post(session, "draft-note", "还没发布", status=PostStatus.DRAFT)
    html_text, _, _ = await render_markdown_preview(session, "见 [[还没发布]]。", None)
    assert "wiki-link--new" in html_text
    assert 'href="/posts/draft-note"' not in html_text


# -------------------------------------------------------------- 图注与尺寸 ---
async def test_preview_renders_captioned_image(session):
    html_text, _, _ = await render_markdown_preview(session, '![图](/media/a.png "后端分层图")', None)
    assert "<figure>" in html_text
    assert "<figcaption>后端分层图</figcaption>" in html_text
    assert "title=" not in html_text


async def test_preview_injects_media_dimensions(session):
    """站内图片必须带上入库的宽高，否则预览里会出现布局偏移（CLS）。"""
    await _add_media(session, "diagram.png", width=1200, height=630, alt="架构图")
    html_text, _, _ = await render_markdown_preview(session, "![架构图](/media/diagram.png)", None)
    assert 'width="1200"' in html_text
    assert 'height="630"' in html_text


# -------------------------------------------------------------- 目录与边界 ---
async def test_preview_reports_toc_and_reading_time(session):
    _, toc, minutes = await render_markdown_preview(
        session, "# 一级标题\n\n## 二级标题\n\n正文。", None
    )
    assert [item["text"] for item in toc] == ["一级标题", "二级标题"]
    assert [item["level"] for item in toc] == [1, 2]
    assert minutes >= 1


async def test_preview_of_empty_content_is_safe(session):
    """开了预览但正文还是空的：不能抛异常，也不能返回半截 HTML。"""
    html_text, toc, minutes = await render_markdown_preview(session, "", None)
    assert html_text.strip() == ""
    assert toc == []
    assert minutes >= 1