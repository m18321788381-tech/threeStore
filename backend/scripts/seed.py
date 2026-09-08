"""种子数据：分类 / 标签 / 示例文章（含 [[双向链接]]、代码块、GFM 表格）/ 示例评论。

用法：
    python scripts/seed.py            # 已存在文章时跳过
    python scripts/seed.py --force    # 清空后重建
"""
from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path

# 以 `python scripts/seed.py` 直跑时 sys.path[0] 是 scripts/，需把项目根（容器内 /app）加入
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select, text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.enums import PostStatus  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.comment import Comment  # noqa: E402
from app.models.post import Post  # noqa: E402
from app.models.tag import Tag  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.links import render_post_content, sync_post_links  # noqa: E402
from app.services.slug import slugify_title  # noqa: E402

NOW = datetime.now(tz=timezone.utc)

CATEGORIES = [
    ("后端工程", "Python / FastAPI / 数据库"),
    ("前端工程", "Next.js / React / 样式"),
    ("工程实践", "部署 / 工具链 / 方法论"),
    ("随笔", "一些不那么技术的记录"),
]

TAGS = ["Python", "FastAPI", "Next.js", "Docker", "数字花园", "Markdown"]

POSTS = [
    {
        "title": "用 FastAPI 重构我的博客后端",
        "category": "后端工程",
        "tags": ["Python", "FastAPI"],
        "summary": "为什么放弃模板直出、选择 FastAPI + SQLAlchemy 2.0 异步栈，以及 content_md / content_html 双存带来的收益。",
        "days_ago": 2,
        "content": """## 为什么要换栈

旧站是模板直出，改一个按钮要动模板、动路由、动 CSS。真正的痛点是：

1. 前后端耦合，想做 SSR 就没法复用同一套数据接口；
2. 评论、搜索这类交互只能靠 jQuery 糊；
3. 部署时 Python 环境和静态资源纠缠在一起。

于是拆成两层：**FastAPI 只返回结构化 JSON**，渲染交给 Next.js。

## 双存：content_md + content_html

Markdown 渲染是有成本的，尤其是开了代码高亮之后。

```python
async def render_post_content(session, post):
    html, toc, reading_time = render(post.content_md)
    post.content_html = html          # 写时渲染
    post.toc = json.dumps(toc)
    return html
```

读取详情时直接取 `content_html`，**渲染成本从「每次请求」降到「每次编辑」**。

## 一点取舍

| 方案 | 优点 | 代价 |
|------|------|------|
| 请求时渲染 | 永远最新 | 首屏慢、CPU 浪费 |
| 写时渲染（采用） | 读路径极快 | 改渲染管线要刷存量 |
| 前后端各渲染一遍 | 预览一致 | 双份实现，易漂移 |

> 这次还顺手把 `[[双向链接]]` 的解析放在了保存时刻，见 [[数字花园：让笔记互相生长]]。""",
    },
    {
        "title": "Next.js App Router 的服务端渲染取舍",
        "category": "前端工程",
        "tags": ["Next.js"],
        "summary": "SSG / SSR / ISR 三种模式在博客场景下的边界，以及评论组件如何以 Client Component 与静态正文共存。",
        "days_ago": 5,
        "content": """## 三种渲染模式的适用边界

- **SSG**：归档页、标签页，内容变更频率低，构建时生成即可；
- **ISR**：首页列表，`revalidate = 60` 让它最多落后一分钟；
- **SSR**：文章详情，SEO 关键页，且要带上一篇/下一篇。

```tsx
export const revalidate = 60;   // 首页 ISR

export default async function Home() {
  const posts = await fetchPosts({ page: 1 });
  return <PostList posts={posts} />;
}
```

## 评论区怎么放

评论区是交互组件，但正文必须能被爬虫读到。做法是：**正文留在 Server Component，评论区单独切一个 `'use client'` 边界**。

```tsx
<article dangerouslySetInnerHTML={{ __html: post.content_html }} />
<CommentSection slug={slug} />   {/* 客户端水合 */}
```

这样首屏 HTML 里已经有完整正文，评论在浏览器里再拉。

## 数据从哪来

Server Component 直接用内网地址访问 `http://backend:8000`，不走公网，延迟低。接口设计见 [[用 FastAPI 重构我的博客后端]]。""",
    },
    {
        "title": "数字花园：让笔记互相生长",
        "category": "工程实践",
        "tags": ["数字花园", "Markdown"],
        "summary": "用 [[笔记名]] 语法把时间倒序的文章流改造成可漫游的知识网络，核心资产是反向引用。",
        "days_ago": 8,
        "content": """## 时间流 vs 知识网络

博客默认是**时间倒序**的：新文章把旧的推下去，老内容写完就死。
数字花园想解决的是另一件事——让笔记之间互相引用，形成结构。

## 语法

```markdown
详见 [[Next.js App Router 的服务端渲染取舍]]
也可以写成带别名：[[Next.js App Router 的服务端渲染取舍|渲染取舍]]
```

保存时后端提取所有 `[[...]]`，解析成 `post_links(source, target)`：
- **Outbound**：本文引用了谁；
- **Backlinks**：谁引用了本文 ← 这才是核心资产。

## 一个例子

这篇笔记被 [[用 FastAPI 重构我的博客后端]] 引用过。也就是说，
哪怕我半年不更新那篇文章，它也会因为新的引用重新获得入口。

## 孤立节点是信号

图谱页会统计孤立节点（没有任何链接的文章）。它们通常意味着：

- [x] 这篇笔记还没被纳入任何脉络
- [ ] 或者它本来就是独立主题
- [ ] 或者标题起得不好，别人想引用时找不到""",
    },
    {
        "title": "Docker Compose 单机编排实践",
        "category": "工程实践",
        "tags": ["Docker"],
        "summary": "六个服务的个人博客如何靠一份 compose 在任何机器上一键拉起：健康检查、依赖就绪、持久卷与多阶段构建。",
        "days_ago": 12,
        "content": """## 容器清单

| 服务 | 镜像 | 端口 |
|------|------|------|
| nginx | nginx:alpine | 80 / 443 |
| frontend | node:20-alpine → next | 内部 3000 |
| backend | python:3.12-slim | 内部 8000 |
| db | postgres:16-alpine | 内部 5432 |

## 别让启动竞态毁了你的早晨

```yaml
backend:
  depends_on:
    db:
      condition: service_healthy   # 而不是简单的 depends_on
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 30s
    start_period: 40s
```

数据库没 ready 就跑迁移，是 compose 新手最常见的坑。

## 多阶段构建

前端 `node:20-alpine` 构建 → 只把 `standalone` 产物拷进运行时；
后端 builder 装依赖 → runtime 精简镜像。镜像体积能砍一半以上。

## 环境变量

全部走 `.env`，**绝不入库**。上线前务必检查 `SECRET_KEY`、`JWT_SECRET`、`DB_PASSWORD` 是强随机值。""",
    },
    {
        "title": "Markdown 渲染管线与安全边界",
        "category": "后端工程",
        "tags": ["Python", "Markdown"],
        "summary": "markdown-it-py + Pygments + bleach 三段式管线：怎么在保留 GFM 丰富表达的同时堵住存储型 XSS。",
        "days_ago": 18,
        "content": """## 三段式管线

```
content_md ──▶ markdown-it-py ──▶ Pygments 高亮 ──▶ bleach 白名单 ──▶ content_html
                    │                                                      │
                    └── [[wiki]] 占位符 ────────────── 回填站内链接 ────────┘
```

## 为什么必须先占位再回填

`[[笔记名]]` 里的内容可能含空格、竖线、中文，直接交给 Markdown 解析器容易被转义搞坏。
所以先把它们换成 `%%WIKILINK0%%` 这种占位符，渲染 + 过滤之后，最后一步才回填成真正的 `<a>`。

## 白名单不是可选项

```python
clean = bleach.clean(
    raw_html,
    tags=ALLOWED_TAGS,        # 只放行必要标签
    attributes=ALLOWED_ATTRS, # a 只放行 href/title/rel/class
    protocols=["http", "https", "mailto"],
    strip=True,
)
```

关键点：

1. `javascript:` 协议必须堵死 —— bleach 的 `protocols` 白名单；
2. 属性白名单比标签白名单更重要，`onerror` 这类事件属性一个都不能放；
3. 过滤之后再插入的内容必须自己 escape。

## GFM 支持情况

- [x] 表格
- [x] 任务列表
- [x] 删除线
- [x] 脚注
- [ ] 数学公式（V2 再接）

配合 [[数字花园：让笔记互相生长]] 的双向链接，这套管线基本够用了。""",
    },
    {
        "title": "关于这套博客的设计取舍",
        "category": "随笔",
        "tags": ["数字花园"],
        "summary": "为什么不做点赞、不做订阅、不做多作者 —— 以及 Ctrl+K 那个彩蛋是怎么来的。",
        "days_ago": 30,
        "content": """## 克制

这是一个单作者博客。所以：

- 不做点赞收藏 —— 数据我自己都不看；
- 不做多作者 —— 权限模型复杂度和收益不成正比；
- 不做国际化 —— 先写好中文。

省下来的时间花在三件事上：**写作体验、阅读体验、内容可移植**。

## 可移植性

`content_md` 是唯一可信源，`content_html` 只是缓存。
哪天我要迁站，把 Markdown 源文件导出来就能走，不会被 HTML 绑死。

## Ctrl+K

终端彩蛋是纯前端实现的，零依赖。按 `Ctrl+K` 试试：

```bash
$ help
$ ls posts
$ theme dark
$ sudo rm -rf /
Permission denied. Nice try.
```

它不执行任何真实副作用，纯粹是给愿意折腾的人一点乐趣。""",
    },
]

COMMENTS = [
    {
        "post": "用 FastAPI 重构我的博客后端",
        "items": [
            ("小林", "双存这个思路很实用，我之前一直在详情页实时渲染，首屏确实慢。", 1),
            ("博主", "对，写少读多的场景这一招收益最大。", 1, True, "用 FastAPI 重构我的博客后端"),
        ],
    },
    {
        "post": "数字花园：让笔记互相生长",
        "items": [
            ("阿吉", "反向引用真的会改变写作习惯，我现在写新笔记都会想一下该挂到哪。", 1),
        ],
    },
]


async def seed(force: bool = False) -> None:
    async with SessionLocal() as session:
        author = (await session.execute(select(User).order_by(User.created_at))).scalars().first()
        if author is None:
            raise SystemExit("请先执行 python scripts/init_admin.py 创建博主账号")

        existing = (await session.execute(select(func.count(Post.id)))).scalar_one()
        if existing and not force:
            print(f"数据库已有 {existing} 篇文章，跳过种子数据（用 --force 重建）")
            return
        if force:
            await session.execute(text("TRUNCATE post_links, comments, post_tags, posts, tags, categories RESTART IDENTITY CASCADE"))

        # ---------- 分类 / 标签 ----------
        cat_map: dict[str, Category] = {}
        for name, desc in CATEGORIES:
            cat = Category(name=name, slug=slugify_title(name), description=desc)
            session.add(cat)
            cat_map[name] = cat

        tag_map: dict[str, Tag] = {}
        for name in TAGS:
            tag = Tag(name=name, slug=slugify_title(name))
            session.add(tag)
            tag_map[name] = tag

        await session.flush()

        # ---------- 文章（先全部落库，再统一渲染以支持互相引用） ----------
        created: list[Post] = []
        for item in POSTS:
            post = Post(
                author_id=author.id,
                category_id=cat_map[item["category"]].id,
                title=item["title"],
                slug=slugify_title(item["title"]),
                summary=item["summary"],
                content_md=item["content"],
                status=PostStatus.PUBLISHED,
                published_at=NOW - timedelta(days=item["days_ago"]),
                view_count=120 - item["days_ago"] * 3,
            )
            post.tags = [tag_map[t] for t in item["tags"]]
            session.add(post)
            created.append(post)

        await session.flush()

        for post in created:
            html, toc, reading_time = await render_post_content(session, post)
            post.content_html = html
            post.toc = json.dumps(toc, ensure_ascii=False)
            post.reading_time = reading_time
            await session.flush()
            await sync_post_links(session, post)

        await session.flush()

        # ---------- 评论 ----------
        slug_to_post = {p.slug: p for p in created}
        for group in COMMENTS:
            post = slug_to_post.get(slugify_title(group["post"]))
            if post is None:
                continue
            parent = None
            for entry in group["items"]:
                name, content, status_ = entry[0], entry[1], entry[2]
                is_author = entry[3] if len(entry) > 3 else False
                comment = Comment(
                    post_id=post.id,
                    parent_id=parent.id if parent else None,
                    author_name=name,
                    content=content,
                    status=status_,
                    is_author=is_author,
                    created_at=NOW - timedelta(hours=6),
                )
                session.add(comment)
                await session.flush()
                if parent is None:
                    parent = comment

        await session.commit()
        print(f"种子数据完成：{len(created)} 篇文章 / {len(CATEGORIES)} 个分类 / {len(TAGS)} 个标签")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="清空并重建种子数据")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="跳过确认（仅在你明确知道要在生产环境灌示例数据时使用）",
    )
    args = parser.parse_args()

    # 种子数据会写入示例文章与评论，误在生产执行会污染真实内容，这里加一道确认。
    if settings.APP_ENV == "production" and not args.yes:
        answer = input(
            "⚠️  当前 APP_ENV=production，执行本脚本会向生产库写入示例数据。\n"
            "   确认继续请输入 yes："
        )
        if answer.strip().lower() != "yes":
            print("已取消。若为验证环境，请设置 APP_ENV=development。")
            raise SystemExit(0)

    asyncio.run(seed(force=args.force))
