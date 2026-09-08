"""重渲染文章的正文缓存（content_html / toc / reading_time）并重建双向链接。

用途：Markdown 渲染管线修好后（[[双向链接]] 占位符、linkify 缺包等），
对已入库的历史文章做一次性回填，避免旧数据继续显示渲染缺陷。

用法：
    python scripts/rerender_posts.py            # 全部重渲染
    python scripts/rerender_posts.py --dry-run  # 只报告有多少文章受影响
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# 以 `python scripts/rerender_posts.py` 直跑时 sys.path[0] 是 scripts/，需把项目根（容器内 /app）加入
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.models.post import Post  # noqa: E402
from app.services.links import render_post_content, sync_post_links  # noqa: E402

# 旧版占位符 bug 的残留特征：正文里出现未回填的 %WIKILINK0% / %%WIKILINK0%%
STALE_MARKERS = ("WIKILINK",)


def _is_stale(post: Post) -> bool:
    html = post.content_html or ""
    return any(marker in html for marker in STALE_MARKERS)


async def rerender(dry_run: bool) -> None:
    async with SessionLocal() as session:
        posts = list(
            (
                await session.execute(select(Post).order_by(Post.created_at))
            ).scalars()
        )
        stale = [p for p in posts if _is_stale(p)]
        print(f"文章总数 {len(posts)}，占位符残留 {len(stale)} 篇", flush=True)
        if dry_run:
            for p in stale:
                print(f"  待回填：{p.slug}", flush=True)
            return

        # 两遍：先回写正文，再统一重建链接（resolver 只看已发布文章，顺序无关）
        for post in posts:
            html, toc, reading_time = await render_post_content(session, post)
            post.content_html = html
            post.toc = json.dumps(toc, ensure_ascii=False)
            post.reading_time = reading_time
        await session.flush()
        for post in posts:
            await sync_post_links(session, post)
        await session.commit()

        left = [p.slug for p in posts if _is_stale(p)]
        print(f"完成重渲染 {len(posts)} 篇，残留 {len(left)} 篇 {left}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="重渲染文章正文缓存")
    parser.add_argument("--dry-run", action="store_true", help="只检查不写库")
    args = parser.parse_args()
    asyncio.run(rerender(args.dry_run))


if __name__ == "__main__":
    main()
