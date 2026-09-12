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
import logging
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

logger = logging.getLogger(__name__)

# gfm-like 预设默认 linkify=True；缺 linkify-it-py 时 markdown-it 会在渲染正文
# 第一个行内 token 时抛 ModuleNotFoundError，导致发文接口 500。缺包就只降级为
# 「裸 URL 不自动转链接」，不阻塞保存。
try:
    import linkify_it  # noqa: F401

    _HAS_LINKIFY = True
except ImportError:  # pragma: no cover - 取决于部署环境
    _HAS_LINKIFY = False
    logger.warning("未安装 linkify-it-py，正文中的裸 URL 不会自动转换为链接")

# ------------------------------------------------------------------ 常量 ---
WIKI_LINK_RE = re.compile(r"\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]")
HEADING_RE = re.compile(r"<h([1-6])>(.*?)</h\1>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
# <img> 标签整体（markdown-it 默认输出不带自闭合斜杠，但两种都兜住）
IMG_TAG_RE = re.compile(r"<img\s[^>]*?/?>", re.I)
IMG_SRC_RE = re.compile(r"""\bsrc\s*=\s*["']([^"']+)["']""", re.I)
ATTR_RE_FMT = r"""\b{}\s*=\s*["']([^"']*)["']"""
# 注意：必须用 str.format 占位；写成 "%%WIKILINK%d%%" % i 会把 %% 折叠成单个 %，
# 导致 PLACEHOLDER_RE 永不匹配、[[链接]] 以原始占位符形式泄漏到正文里。
PLACEHOLDER_FMT = "%%WIKILINK{idx}%%"
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
        MarkdownIt(
            "gfm-like",
            {"highlight": _highlight_code, "html": False, "linkify": _HAS_LINKIFY},
        )
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


# ----------------------------------------------------------- 图片属性补全 ---
def _attr_value(tag: str, name: str) -> str | None:
    m = re.search(ATTR_RE_FMT.format(name), tag, re.I)
    return m.group(1) if m else None


def _append_attrs(tag: str, additions: dict[str, str]) -> str:
    """把属性追加到 <img ...> 收尾之前，原有属性一律不动。"""
    body = tag[:-1] if tag.endswith(">") else tag
    if body.endswith("/"):
        body = body[:-1].rstrip()
    for name, value in additions.items():
        body += f' {name}="{value}"'
    return f"{body}>"


def inject_image_dimensions(
    html_text: str, media_meta: dict[str, tuple[int, int, str]]
) -> str:
    """给正文里引用站内媒体的 <img> 补上 width/height，并在 alt 为空时兜底。

    为什么必须在**服务端渲染时**注入：
      浏览器只有在初始 HTML 里拿到尺寸，才能在图片解码完成前预留占位空间。
      前端脚本再补已经晚了 —— 等脚本执行时布局已经跳动过一次，
      CLS（累积布局偏移）已经被计入。技术博客正文截图多，这是主要失分点。

    为什么顺手补 alt：
      markdown 写成 `![](/media/x.png)` 时产出的是空 alt，
      而 alt 是媒体库里已经维护过一次的信息，没有理由让它空着。
      作者手写了 alt 则以作者为准（见下方判断）。

    :param media_meta: {filename: (width, height, alt)}，由调用方一次性查出。
        这是纯函数：不查库、不依赖 session，便于单测。
    """
    if not html_text or not media_meta:
        return html_text

    def _repl(match: re.Match) -> str:
        tag = match.group(0)
        src = IMG_SRC_RE.search(tag)
        if not src:
            return tag
        # 去掉查询串后取末段文件名，兼容绝对地址、相对地址与 CDN 前缀
        name = src.group(1).split("?")[0].rsplit("/", 1)[-1]
        info = media_meta.get(name)
        if info is None:
            return tag
        width, height, alt = info

        additions: dict[str, str] = {}
        if width > 0 and height > 0:
            additions["width"] = str(width)
            additions["height"] = str(height)
        if alt and not _attr_value(tag, "alt"):
            additions["alt"] = html.escape(alt, quote=True)
        if not additions:
            return tag
        return _append_attrs(tag, additions)

    return IMG_TAG_RE.sub(_repl, html_text)


# --------------------------------------------------------------- 主入口 ---
def render_markdown(
    md_text: str,
    wiki_resolver: "callable | None" = None,  # type: ignore[valid-type]
    media_meta: dict[str, tuple[int, int, str]] | None = None,
) -> RenderResult:
    """渲染 Markdown -> (html, toc, wiki_targets, reading_time)。

    :param wiki_resolver: 接收「笔记名」，返回 slug 或 None（未匹配）
    :param media_meta: {filename: (width, height, alt)}，用于给正文图片补
        width/height/alt（见 inject_image_dimensions）。传 None 则跳过。
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
            return PLACEHOLDER_FMT.format(idx=idx)

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

    # 6) 站内图片补 width/height/alt（必须在 bleach 之后：注入的属性不再过白名单，
    #    这是安全的——值全部来自本地媒体表，不含用户可控的 HTML）
    final_html = inject_image_dimensions(final_html, media_meta or {})

    return RenderResult(
        html=final_html,
        toc=toc,
        wiki_targets=wiki_targets,
        reading_time=estimate_reading_time(md_text),
    )


def render_plain(md_text: str) -> str:
    """不需要 wiki 解析的场景（如后台快速预览）。"""
    return render_markdown(md_text).html
