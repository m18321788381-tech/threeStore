"""正文图片尺寸注入的回归测试（不依赖数据库）。

为什么值得钉住：
    `content_html` 是**保存时渲染并落库**的缓存。尺寸注入一旦写错，
    错误会被固化进数据库，之后每次访问都带着错误的 width/height ——
    既产生 CLS，又要重新保存文章才能修好。所以这条路径必须有断言兜着。

覆盖的是纯函数 `inject_image_dimensions`，它负责把媒体的
(width, height, alt) 补进正文 HTML 的 <img> 上。
"""
from __future__ import annotations

from app.services.markdown import inject_image_dimensions

META = {
    "shot.png": (1280, 720, "构建流水线截图"),
    "diagram.svg": (640, 480, ""),
}


def test_injects_width_and_height():
    html = '<p><img src="/media/shot.png" alt=""></p>'
    out = inject_image_dimensions(html, META)
    assert 'width="1280"' in out and 'height="720"' in out


def test_keeps_author_written_alt():
    # 作者手写的 alt 优先级更高：媒体库里的 alt 只是兜底
    html = '<img src="/media/shot.png" alt="作者自己的描述">'
    out = inject_image_dimensions(html, META)
    assert "作者自己的描述" in out
    assert "构建流水线截图" not in out


def test_fills_alt_when_missing():
    html = '<img src="/media/shot.png">'
    out = inject_image_dimensions(html, META)
    assert 'alt="构建流水线截图"' in out


def test_alt_lookup_still_happens_when_dimensions_unknown():
    # 尺寸为 0（存量数据没回填）时仍应补 alt —— 两个能力互不依赖
    meta = {"ghost.png": (0, 0, "老图")}
    out = inject_image_dimensions('<img src="/media/ghost.png">', meta)
    assert 'alt="老图"' in out
    assert "width=" not in out


def test_matches_absolute_url_and_query_string():
    # 正文可能写绝对地址、带 CDN 前缀或带 ?v= 查询串，都要能认出同一个文件
    cases = [
        '<img src="https://blog.example.com/media/shot.png">',
        '<img src="/media/shot.png?v=2">',
        "<img src='/media/shot.png'>",
    ]
    for html in cases:
        out = inject_image_dimensions(html, META)
        assert 'width="1280"' in out, html


def test_unknown_image_untouched():
    # 外链图片不在媒体库中，不能瞎猜尺寸
    html = '<img src="https://cdn.example.com/other.png">'
    assert inject_image_dimensions(html, META) == html


def test_escapes_alt():
    meta = {"x.png": (10, 10, 'a "quote" & <tag>')}
    out = inject_image_dimensions('<img src="/media/x.png">', meta)
    assert "&quot;" in out and "&amp;" in out
    assert "<tag>" not in out


def test_self_closing_tag_style():
    out = inject_image_dimensions('<img src="/media/shot.png" />', META)
    assert 'width="1280"' in out and out.endswith(">")
    assert "/>" not in out


def test_noop_on_empty_input():
    assert inject_image_dimensions("", META) == ""
    assert inject_image_dimensions('<img src="/media/shot.png">', {}) == (
        '<img src="/media/shot.png">'
    )


def test_external_images_in_same_html_are_preserved():
    html = (
        '<img src="https://cdn.example.com/a.png">'
        '<img src="/media/shot.png">'
        '<img src="https://cdn.example.com/b.png">'
    )
    out = inject_image_dimensions(html, META)
    assert out.count("<img") == 3
    assert out.count('width="1280"') == 1
