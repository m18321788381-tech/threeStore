"""RSS / Sitemap 生成的回归测试（纯函数，不依赖数据库）。

为什么需要这一层：
    这两个产物是「静默失效」的高危区——它们不报错，只是默默少输出内容，
    而后果要到搜索引擎/阅读器那边才看得出来。本项目已经踩过两次：
      ① 前端那份 sitemap 因 page_size 超上限拿到 422，被 `!res.ok return null`
         静默吞掉，结果「零文章收录」，线上却毫无异常；
      ② SEO 缓存失效链路只有发布者、没有订阅者，新文章最长一小时不进 sitemap。
    因此这里把「必须输出什么」逐条钉死。

也覆盖两个具体缺陷：
    - RSS 原先只有 <description> 摘要，没有 <content:encoded> 全文；
    - 调用方算了 author 字段，build_feed 却从不读取（空转）。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.feed import (
    STATIC_ROUTES,
    build_feed,
    build_sitemap,
)


def _post(slug: str, **overrides) -> dict:
    base = {
        "title": f"标题 {slug}",
        "slug": slug,
        "summary": "摘要",
        "content_html": "<p>正文</p>",
        "published_at": datetime(2026, 9, 13, 10, 0, tzinfo=timezone.utc),
        "updated_at": None,
        "author": "博主",
        "categories": ["后端"],
    }
    base.update(overrides)
    return base


# --------------------------------------------------------------------- feed ---


def test_feed_outputs_full_content_not_only_summary():
    """核心回归：RSS 必须带全文，否则读者被迫跳站。"""
    xml = build_feed([_post("hello", content_html="<p>完整正文内容</p>")])
    assert "<content:encoded>" in xml
    assert "<p>完整正文内容</p>" in xml


def test_feed_declares_content_namespace():
    """用了 content: 前缀就必须声明命名空间，否则 XML 不合法。"""
    xml = build_feed([_post("a")])
    assert 'xmlns:content="http://purl.org/rss/1.0/modules/content/"' in xml


def test_feed_outputs_author_as_dc_creator():
    """author 曾是空转字段：算出来了但从不输出。"""
    xml = build_feed([_post("a", author="三石")])
    assert "<dc:creator>三石</dc:creator>" in xml
    assert 'xmlns:dc="http://purl.org/dc/elements/1.1/"' in xml


def test_feed_omits_dc_creator_when_author_blank():
    xml = build_feed([_post("a", author="")])
    assert "<dc:creator>" not in xml


def test_feed_cdata_escapes_closing_sequence():
    """正文里出现 ]]> 必须拆开，否则提前闭合 CDATA、整个 XML 报废。"""
    xml = build_feed([_post("a", content_html="<p>危险的 ]]> 序列</p>")])
    assert "]]]]><![CDATA[>" in xml
    # 原始的三字符序列不能再出现在 CDATA 内部
    assert "危险的 ]]> 序列" not in xml


def test_feed_escapes_title_and_summary():
    xml = build_feed([_post("a", title="A & B <c>", summary="1 < 2")])
    assert "A &amp; B &lt;c&gt;" in xml
    assert "1 &lt; 2" in xml


def test_feed_pubdate_is_utc_normalized():
    """原先用 datetime.utcnow()：无时区却拼硬编码 +0000，服务器非 UTC 就会错。"""
    naive = datetime(2026, 9, 13, 10, 0)  # 无时区
    xml = build_feed([_post("a", published_at=naive)])
    assert "<pubDate>Sun, 13 Sep 2026 10:00:00 +0000</pubDate>" in xml


def test_feed_pubdate_converts_non_utc_offset():
    """带 +08:00 的时间必须换算成 UTC，而不是把字面数字直接当成 UTC。"""
    tz8 = timezone(timedelta(hours=8))
    xml = build_feed([_post("a", published_at=datetime(2026, 9, 13, 18, 0, tzinfo=tz8))])
    assert "<pubDate>Sun, 13 Sep 2026 10:00:00 +0000</pubDate>" in xml


def test_feed_has_ttl_and_generator():
    xml = build_feed([_post("a")])
    assert "<ttl>" in xml
    assert "<generator>" in xml


def test_feed_empty_items_is_still_valid_channel():
    xml = build_feed([])
    assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    assert "<channel>" in xml and "</rss>" in xml
    assert "<item>" not in xml


# ------------------------------------------------------------------ sitemap ---


def test_sitemap_covers_all_static_landing_pages():
    """曾经漏掉 /posts(主入口)、/categories、/about。"""
    xml = build_sitemap([])
    for path, _, _ in STATIC_ROUTES:
        assert f"<loc>http://localhost{path}</loc>" in xml, f"缺少静态路由 {path!r}"
    for expected in ("/posts", "/categories", "/about"):
        assert f"<loc>http://localhost{expected}</loc>" in xml


def test_sitemap_includes_posts_with_lastmod():
    xml = build_sitemap(
        [
            {
                "slug": "hello",
                "published_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 9, 13, tzinfo=timezone.utc),
            }
        ]
    )
    assert "<loc>http://localhost/posts/hello</loc>" in xml
    assert "<lastmod>2026-09-13</lastmod>" in xml


def test_sitemap_prefers_updated_at_over_published_at():
    """updated_at 上有 onupdate，才是内容真变过的时间。"""
    xml = build_sitemap(
        [
            {
                "slug": "p",
                "published_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 9, 13, tzinfo=timezone.utc),
            }
        ]
    )
    assert "<lastmod>2026-09-13</lastmod>" in xml
    assert "<lastmod>2026-01-01</lastmod>" not in xml


def test_sitemap_falls_back_to_published_at_without_updated_at():
    xml = build_sitemap(
        [
            {
                "slug": "p",
                "published_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
                "updated_at": None,
            }
        ]
    )
    assert "<lastmod>2026-01-01</lastmod>" in xml


def test_sitemap_includes_tag_and_category_detail_pages():
    """这两类是文章之外最重要的聚合落地页，此前两份实现都没收录。"""
    xml = build_sitemap(
        [],
        tags=[{"slug": "docker", "updated_at": None}],
        categories=[{"slug": "backend", "updated_at": None}],
    )
    assert "<loc>http://localhost/tags/docker</loc>" in xml
    assert "<loc>http://localhost/categories/backend</loc>" in xml


def test_sitemap_omits_empty_tag_and_category_lists():
    xml = build_sitemap([], tags=[], categories=[])
    assert "/tags/" not in xml.replace("/tags</loc>", "")
    assert "/categories/" not in xml.replace("/categories</loc>", "")


def test_sitemap_escapes_slug():
    """slug 理论上是 slugify 过的，但 XML 转义不能依赖上游永远正确。"""
    xml = build_sitemap([{"slug": "a&b", "published_at": None, "updated_at": None}])
    assert "a&amp;b" in xml
    assert "a&b" not in xml


def test_sitemap_is_well_formed_xml():
    """整体 XML 必须可解析——拼接字符串最容易在这里悄悄坏掉。"""
    from xml.etree import ElementTree

    xml = build_sitemap(
        [{"slug": "p", "published_at": None, "updated_at": None}],
        tags=[{"slug": "t", "updated_at": None}],
        categories=[{"slug": "c", "updated_at": None}],
    )
    root = ElementTree.fromstring(xml)
    assert root.tag.endswith("urlset")
    assert len(list(root)) == len(STATIC_ROUTES) + 3


@pytest.mark.parametrize("slug", ["中文-slug", "with space", "quote'x"])
def test_sitemap_handles_awkward_slugs(slug: str):
    from xml.etree import ElementTree

    xml = build_sitemap([{"slug": slug, "published_at": None, "updated_at": None}])
    ElementTree.fromstring(xml)  # 不抛异常即可
