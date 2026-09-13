"""RSS 2.0 Feed 与 Sitemap.xml 生成（SEO 必需）。

设计要点：

1. **sitemap 由后端独占**。nginx 把 `/sitemap.xml` 直接转发到本模块（`feed.xml` 同理），
   前端不再提供同名路由。此前前端也有一份 `app/sitemap.ts`，两份口径不一致
   （静态路由条数不同、lastmod 取值不同），且前端那份请求 `page_size=500`
   超过后端 `MAX_PAGE_SIZE=200` 而拿到 422，又因 `serverGet` 静默吞错，
   最终「零文章收录」却不报错。**双份真相 + 静默失败**，故删除前端实现。
   本模块直接全量查库，没有分页上限，不存在截断问题。

2. **feed 输出全文**（`content:encoded`）。技术博客读者的普遍预期是在阅读器内读完，
   只给摘要会迫使读者跳站，削弱 RSS 的实际价值。

3. **sitemap 排除 `noindex` 文章**。既然声明了不收录，就不该同时出现在 sitemap 里——
   两边都给信号会让搜索引擎无所适从。
"""
from __future__ import annotations

from datetime import datetime, timezone
from xml.sax.saxutils import escape

from app.core.config import settings

# 站内静态落地页：(路径, changefreq, priority)
STATIC_ROUTES: tuple[tuple[str, str, str], ...] = (
    ("", "daily", "1.0"),
    ("/posts", "daily", "0.9"),
    ("/archive", "weekly", "0.6"),
    ("/categories", "weekly", "0.5"),
    ("/tags", "weekly", "0.5"),
    ("/garden", "weekly", "0.5"),
    ("/about", "monthly", "0.4"),
)

# RSS 条数上限：阅读器与抓取器都不需要「全站」，
# 但这是一个显式常量，而不是散落在查询里的魔法数字。
RSS_FEED_LIMIT = 50


def _rfc822(dt: datetime | None) -> str:
    """RFC 822 时间，统一按 UTC 输出。

    原先用 `datetime.utcnow()`（Python 3.12 起废弃，且返回**无时区**对象）
    却拼上硬编码的 "+0000"：服务器时区一旦不是 UTC 就会静默产出错误时间。
    这里显式补齐时区再换算。
    """
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")


def _iso_date(dt: datetime | None) -> str:
    """sitemap 的 lastmod 只要日期粒度。"""
    return dt.strftime("%Y-%m-%d") if dt else ""


def _cdata(text: str) -> str:
    """包成 CDATA。

    正文里若出现 `]]>` 必须拆开，否则会提前闭合 CDATA 段并破坏整个 XML。
    """
    safe = (text or "").replace("]]>", "]]]]><![CDATA[>")
    return f"<![CDATA[{safe}]]>"


def build_feed(items: list[dict]) -> str:
    """items: [{title, slug, summary, content_html, published_at, author, categories:[...]}]

    `author` 会被真正输出为 `dc:creator`。此前调用方算了 author 却从不读取，
    属「写了不读」的空转字段。
    """
    site_url = settings.SITE_URL.rstrip("/")
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"',
        '     xmlns:atom="http://www.w3.org/2005/Atom"',
        '     xmlns:content="http://purl.org/rss/1.0/modules/content/"',
        '     xmlns:dc="http://purl.org/dc/elements/1.1/">',
        "<channel>",
        f"<title>{escape(settings.SITE_TITLE)}</title>",
        f"<link>{escape(site_url)}</link>",
        f"<description>{escape(settings.SITE_DESCRIPTION)}</description>",
        f"<language>{escape(settings.SITE_LOCALE)}</language>",
        f"<lastBuildDate>{_rfc822(datetime.now(timezone.utc))}</lastBuildDate>",
        "<generator>three-store</generator>",
        f"<ttl>{settings.RSS_TTL_MINUTES}</ttl>",
        f'<atom:link href="{escape(site_url)}/feed.xml" rel="self" '
        'type="application/rss+xml"/>',
        f'<atom:link href="{escape(site_url)}" rel="alternate" type="text/html"/>',
    ]
    for it in items:
        link = f"{site_url}/posts/{it['slug']}"
        parts += [
            "<item>",
            f"<title>{escape(it['title'])}</title>",
            f"<link>{escape(link)}</link>",
            f'<guid isPermaLink="true">{escape(link)}</guid>',
            f"<pubDate>{_rfc822(it.get('published_at'))}</pubDate>",
        ]
        if it.get("author"):
            parts.append(f"<dc:creator>{escape(it['author'])}</dc:creator>")
        parts.append(f"<description>{escape(it.get('summary') or '')}</description>")
        body = it.get("content_html") or ""
        if body:
            parts.append(f"<content:encoded>{_cdata(body)}</content:encoded>")
        for cat in it.get("categories") or []:
            parts.append(f"<category>{escape(cat)}</category>")
        parts.append("</item>")

    parts += ["</channel>", "</rss>"]
    return "\n".join(parts)


def _url_entry(loc: str, changefreq: str, priority: str, lastmod: str = "") -> str:
    lastmod_tag = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
    return (
        f"<url><loc>{escape(loc)}</loc>{lastmod_tag}"
        f"<changefreq>{changefreq}</changefreq>"
        f"<priority>{priority}</priority></url>"
    )


def build_sitemap(
    posts: list[dict],
    tags: list[dict] | None = None,
    categories: list[dict] | None = None,
) -> str:
    """posts: [{slug, published_at, updated_at}]；tags / categories: [{slug, updated_at}]

    本函数是**纯函数**：只负责把传入的数据序列化成 XML，不做业务过滤。
    「只传已发布且非 noindex 的文章」「只传有已发布文章的标签/分类」
    由 `services/seo.py` 的查询负责，这样便于单测。
    """
    site_url = settings.SITE_URL.rstrip("/")
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, freq, priority in STATIC_ROUTES:
        parts.append(_url_entry(f"{site_url}{path}", freq, priority))

    for it in posts:
        # updated_at 是更真实的 lastmod：TimestampMixin 上挂了 onupdate=func.now()，
        # 内容一改就会刷新，而 published_at 只反映首次上线时间。
        lastmod = _iso_date(it.get("updated_at") or it.get("published_at"))
        parts.append(
            _url_entry(f"{site_url}/posts/{it['slug']}", "monthly", "0.8", lastmod)
        )

    for it in tags or []:
        parts.append(
            _url_entry(
                f"{site_url}/tags/{it['slug']}",
                "weekly",
                "0.4",
                _iso_date(it.get("updated_at")),
            )
        )

    for it in categories or []:
        parts.append(
            _url_entry(
                f"{site_url}/categories/{it['slug']}",
                "weekly",
                "0.4",
                _iso_date(it.get("updated_at")),
            )
        )

    parts.append("</urlset>")
    return "\n".join(parts)


__all__ = ["STATIC_ROUTES", "RSS_FEED_LIMIT", "build_feed", "build_sitemap"]
