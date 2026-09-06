"""RSS 2.0 Feed 与 Sitemap.xml 生成（SEO 必需）。"""
from __future__ import annotations

from datetime import datetime
from xml.sax.saxutils import escape

from app.core.config import settings


def _rfc822(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.strftime("%a, %d %b %Y %H:%M:%S +0000")


def build_feed(items: list[dict]) -> str:
    """items: [{title, slug, summary, published_at, author, categories:[...]}]"""
    site_url = settings.SITE_URL.rstrip("/")
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"<title>{escape(settings.SITE_TITLE)}</title>",
        f"<link>{escape(site_url)}</link>",
        f"<description>{escape(settings.SITE_DESCRIPTION)}</description>",
        f"<language>{escape(settings.SITE_LOCALE)}</language>",
        f"<lastBuildDate>{_rfc822(datetime.utcnow())}</lastBuildDate>",
        f'<atom:link href="{escape(site_url)}/feed.xml" rel="self" '
        'type="application/rss+xml"/>',
    ]
    for it in items:
        link = f"{site_url}/posts/{it['slug']}"
        parts += [
            "<item>",
            f"<title>{escape(it['title'])}</title>",
            f"<link>{escape(link)}</link>",
            f"<guid isPermaLink=\"true\">{escape(link)}</guid>",
            f"<pubDate>{_rfc822(it.get('published_at'))}</pubDate>",
            f"<description>{escape(it.get('summary') or '')}</description>",
        ]
        for cat in it.get("categories") or []:
            parts.append(f"<category>{escape(cat)}</category>")
        parts.append("</item>")

    parts += ["</channel>", "</rss>"]
    return "\n".join(parts)


def build_sitemap(items: list[dict]) -> str:
    site_url = settings.SITE_URL.rstrip("/")
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        f"<url><loc>{escape(site_url)}/</loc><changefreq>daily</changefreq>"
        "<priority>1.0</priority></url>",
        f"<url><loc>{escape(site_url)}/archive</loc><changefreq>weekly</changefreq>"
        "<priority>0.6</priority></url>",
        f"<url><loc>{escape(site_url)}/tags</loc><changefreq>weekly</changefreq>"
        "<priority>0.5</priority></url>",
        f"<url><loc>{escape(site_url)}/garden</loc><changefreq>weekly</changefreq>"
        "<priority>0.5</priority></url>",
    ]
    for it in items:
        lastmod = (it.get("published_at") or it.get("updated_at"))
        lastmod_str = lastmod.strftime("%Y-%m-%d") if lastmod else ""
        parts.append(
            f"<url><loc>{escape(site_url)}/posts/{escape(it['slug'])}</loc>"
            f"<lastmod>{lastmod_str}</lastmod><changefreq>monthly</changefreq>"
            "<priority>0.8</priority></url>"
        )
    parts.append("</urlset>")
    return "\n".join(parts)
