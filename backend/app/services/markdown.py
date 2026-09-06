"""Markdown 渲染服务。

设计要点（对应设计文档 §3.3 / §5.7.2）：
1. Markdown 源文在**保存时**渲染为 HTML 缓存，读取详情零渲染成本；
2. `[[笔记名]]` / `[[笔记名|显示文本]]` 会按 resolver 解析成站内链接，
   未匹配的渲染为「待创建」灰色标记（Roam / Obsidian 风格）；
3. 渲染结果必须经 bleach 白名单 sanitize，杜绝存储型 XSS；
4. 顺带产出 TOC（标题锚点）与阅读时长。
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field

import bleach
from markdown_it import MarkdownIt
from mdit_py_plugins.footnote import footnote_plugin
from mdit_py_plugins.tasklists import tasklists_plugin
from pygments import highlight as pygments_highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name, guess_lexer
from pygments.lexers.special import TextLexer
from pygments.util import ClassNotFound

# ------------------------------------------------------------------ 常量 ---
WIKI_LINK_RE = re.compile(r"\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]")
HEADING_RE = re.compile(r"<h([1-6])>(.*?)</h\1>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
PLACEHOLDER_FMT = "%%WIKILINK%d%%"
PLACEHOLDER_RE = re.compile(r"%%WIKILINK(\d+)%%")

ALLOWED_TAGS = [
    "a", "abbr", "b", "blockquote", "br", "code", "del", "details", "div", "em",
    "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img",
    "input", "ins", "kbd", "li", "mark", "ol", "p", "pre", "section", "span",
    "strong", "sub", "summary", "sup", "table", "tbody", "td", "tfoot", "th",
    "thead", "tr", "ul",
]
ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel", "class", "data-wiki"],
    "img": ["src", "alt", "title", "width", "height", "loading", "class"],
    "input": ["type", "checked", "disabled", "class"],
    "code": ["class"],
    "span": ["class", "title", "data-wiki"],
    "div": ["class"],
    "pre": ["class"],
    "th": ["colspan", "rowspan", "align", "style"],
    "td": ["colspan", "rowspan", "align", "style"],
    "ol": ["start"],
    "details": ["open"],
}
ALLOWED_PROTOCOLS = ["http", "https", "mailto", ""]


@dataclass
class TocItem:
    level: int
    text: str
    anchor: str


@dataclass
class RenderResult:
    html: str
    toc: list[TocItem] = field(default_factory=list)
    wiki_targets: list[str] = field(default_factory=list)
    reading_time: int = 1


# --------------------------------------------------------------- 代码高亮 ---
def _highlight_code(code: str, lang: str, attrs: str) -> str:
    """pygments 高亮；无法识别语言时降级为纯文本。"""
    lang = (lang or "").strip().lower()
    try:
        lexer = get_lexer_by_name(lang, stripall=True) if lang else guess_lexer(code)
    except ClassNotFound:
        lexer = TextLexer(stripall=True)
    formatter = HtmlFormatter(nowrap=True, cssclass="highlight")
    return pygments_highlight(code, lexer, formatter).rstrip("\n")


def _build_parser() -> MarkdownIt:
    md = (
        MarkdownIt("gfm-like", {"highlight": _highlight_code, "html": False})
        .enable(["table", "strikethrough"])
        .use(tasklists_plugin, enabled=True, label=True, label_after=False)
        .use(footnote_plugin)
    )
    return md


_MD = _build_parser()


# ------------------------------------------------------------- 工具函数 ---
def extract_wikilinks(md_text: str) -> list[tuple[str, str]]:
    """提取全部 `[[目标]]` / `[[目标|显示文本]]`，返回 [(target, text), ...]。"""
    result: list[tuple[str, str]] = []
    for m in WIKI_LINK_RE.finditer(md_text or ""):
        target = m.group(1).strip()
        text = (m.group(2) or m.group(1)).strip()
        if target:
            result.append((target, text))
    return result


def estimate_reading_time(md_text: str) -> int:
    """中英文混合估算：中文按 400 字/分钟，英文按 220 词/分钟。"""
    if not md_text:
        return 1
    cjk = len(re.findall(r"[\u4e00-\u9fff]", md_text))
    words = len(re.findall(r"[A-Za-z0-9]+", md_text))
    minutes = cjk / 400 + words / 220
    return max(1, round(minutes))


def _slugify_heading(text: str) -> str:
    slug = re.sub(r"[^\w\u4e00-\u9fff\- ]", "", text).strip().lower()
    slug = re.sub(r"[\s]+", "-", slug)
    return slug or "section"


def _inject_heading_ids(html_text: str) -> tuple[str, list[TocItem]]:
    """给 <h1>~<h6> 加上 id，并生成 TOC。"""
    toc: list[TocItem] = []
    seen: dict[str, int] = {}

    def _repl(match: re.Match) -> str:
        level = int(match.group(1))
        raw = match.group(2)
        text = html.unescape(TAG_RE.sub("", raw)).strip()
        base = _slugify_heading(text)
        seen[base] = seen.get(base, 0) + 1
        anchor = base if seen[base] == 1 else f"{base}-{seen[base]}"
        toc.append(TocItem(level=level, text=text, anchor=anchor))
        return f'<h{level} id="{anchor}">{raw}</h{level}>'

    return HEADING_RE.sub(_repl, html_text), toc


# --------------------------------------------------------------- 主入口 ---
def render_markdown(
    md_text: str,
    wiki_resolver: "callable | None" = None,  # type: ignore[valid-type]
) -> RenderResult:
    """渲染 Markdown -> (html, toc, wiki_targets, reading_time)。

    :param wiki_resolver: 接收「笔记名」，返回 slug 或 None（未匹配）
    """
    source = md_text or ""
    wikilinks = extract_wikilinks(source)
    wiki_targets = [t for t, _ in wikilinks]

    # 1) 先把 [[...]] 换成占位符，避免 markdown 转义破坏语义
    resolved: list[tuple[str, str, str | None]] = []  # (text, target, slug|None)
    if wikilinks:
        def _to_placeholder(m: re.Match) -> str:
            idx = len(resolved)
            target = m.group(1).strip()
            text = (m.group(2) or m.group(1)).strip()
            slug = wiki_resolver(target) if wiki_resolver else None
            resolved.append((text, target, slug))
            return PLACEHOLDER_FMT % idx

        source = WIKI_LINK_RE.sub(_to_placeholder, source)

    # 2) Markdown -> HTML
    raw_html = _MD.render(source)

    # 3) XSS 白名单过滤
    clean_html = bleach.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )

    # 4) 占位符 -> 真实链接（内容已 escape，安全）
    if resolved:
        def _fill(m: re.Match) -> str:
            text, target, slug = resolved[int(m.group(1))]
            safe_text = html.escape(text)
            if slug:
                return (
                    f'<a class="wiki-link" href="/posts/{html.escape(slug)}" '
                    f'data-wiki="{html.escape(slug)}" title="{html.escape(target)}">'
                    f"{safe_text}</a>"
                )
            return (
                f'<span class="wiki-link wiki-link--new" '
                f'title="尚未创建：{html.escape(target)}">{safe_text}'
                f'<span class="wiki-link__plus">+</span></span>'
            )

        clean_html = PLACEHOLDER_RE.sub(_fill, clean_html)

    # 5) 标题锚点 + TOC
    final_html, toc = _inject_heading_ids(clean_html)

    return RenderResult(
        html=final_html,
        toc=toc,
        wiki_targets=wiki_targets,
        reading_time=estimate_reading_time(md_text),
    )


def render_plain(md_text: str) -> str:
    """不需要 wiki 解析的场景（如后台快速预览）。"""
    return render_markdown(md_text).html
