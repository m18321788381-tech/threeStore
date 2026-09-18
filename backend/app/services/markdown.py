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
from markdown_it.common.utils import escapeHtml
from mdit_py_plugins.dollarmath import dollarmath_plugin
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

# ---- 围栏代码块的 info 串附加属性 -----------------------------------------
# 形如 ```python title=app.py {1,3-5} ：
#   title=/filename=   → 代码块标题栏显示文件名
#   {1,3-5}            → 高亮指定行（逗号分隔，支持区间）
# 识别不了的写法一律忽略，绝不因为附加属性不认识就把整块代码丢掉。
FENCE_FILENAME_RE = re.compile(r"\b(?:title|filename)=(\"[^\"]*\"|'[^']*'|\S+)", re.I)
# 裸文件名兜底（```python app.py）：必须是带扩展名的文件样式，
# 否则 ```js strict 里的 strict 会被误当成文件名。
FENCE_BARE_FILE_RE = re.compile(r"^[\w./-]+\.[A-Za-z0-9]{1,8}$")
FENCE_HL_RE = re.compile(r"\{([^}]*)\}")

# ---- 数学公式与图表：容器标记 ---------------------------------------------
# KaTeX / Mermaid 都在前端渲染。服务端只产出稳定的 class 容器，
# 这样 bleach 白名单可以最小放行，前端也有明确的挂载点。
MATH_INLINE_CLASS = "math-inline"
MATH_BLOCK_CLASS = "math-block"
MERMAID_CLASS = "mermaid-block"

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
    # div 上的 id 只为带编号的公式块服务（$$...$$ (eq1) 的跳转锚点）。
    # 放行它是安全的：渲染器关闭了 html，div 只能由数学公式规则产出，
    # 且 id 值经 label_normalizer 收敛为 [A-Za-z0-9_-]，不含可控字符。
    "div": ["class", "id"],
    # data-file / data-hl 是围栏代码块的标题栏与行高亮信息，值由服务端从
    # 正文 info 串解析后转义写入，前端据此渲染（不再二次解析 HTML 文本）。
    "pre": ["class", "data-file", "data-hl"],
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


# ------------------------------------------------------- 围栏代码块附加属性 ---
def _unquote(value: str) -> str:
    """去掉 title="x" 两侧的引号（含单/双引号）。"""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def parse_fence_meta(attrs: str) -> tuple[str, list[int]]:
    """从围栏 info 串的附加部分解析出 (文件名, 高亮行号)。

    支持两种写法：
      ```python title=app.py {1,3-5}   → ("app.py", [1, 3, 4, 5])
      ```python app.py {2}             → ("app.py", [2])

    解析失败一律返回空值，调用方按「无标题栏、无高亮」正常渲染代码，
    绝不因为附加属性写错而丢内容。
    """
    text = (attrs or "").strip()
    if not text:
        return "", []

    filename = ""
    hl_lines: list[int] = []

    # 1) 显式 title=/filename=（值可带引号，也可不带）
    m = FENCE_FILENAME_RE.search(text)
    if m:
        filename = _unquote(m.group(1)).strip()
        text = text[: m.start()] + " " + text[m.end() :]

    # 2) 行高亮 {1,3-5}
    m = FENCE_HL_RE.search(text)
    if m:
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            if "-" in part:
                lo, _, hi = part.partition("-")
                if lo.strip().isdigit() and hi.strip().isdigit():
                    start, stop = int(lo), int(hi)
                    if start > stop:
                        start, stop = stop, start
                    # 上限兜住极端区间（如 {1-999999}）：代码块超过 500 行的高亮
                    # 已无阅读意义，截断即可，避免把整块代码都涂成高亮色。
                    hl_lines.extend(range(start, min(stop, start + 500) + 1))
            elif part.isdigit():
                hl_lines.append(int(part))
        text = text[: m.start()] + " " + text[m.end() :]

    # 3) 裸文件名兜底：只在没有显式 title 时尝试
    if not filename:
        for word in text.split():
            if FENCE_BARE_FILE_RE.match(word):
                filename = word
                break

    return filename, sorted({n for n in hl_lines if n > 0})


# --------------------------------------------------------------- 代码高亮 ---
def _highlight_code(code: str, lang: str, attrs: str) -> str:
    """pygments 高亮；无法识别语言时降级为纯文本。

    两处特殊处理：
      1. mermaid 交给前端渲染：这里只产出「原样代码 + 容器标记」，
         图表由浏览器按需加载 mermaid 绘制，服务端不做图渲染。
      2. 行高亮用 Pygments 的 hl_lines，产出 <span class="hll">，
         颜色由已有的 pygments.css 提供，浅/暗主题都覆盖到了。

    返回值以 `<pre` 开头时，markdown-it 会原样透传、不再包一层
    `<pre><code>`（见 markdown_it/renderer.py 的 fence 规则）。因此这里
    直接产出完整的外层标签，标题栏与高亮行信息可以内联写死在属性上，
    不需要事后再去按顺序对齐 <pre> —— 那种对齐一旦遇到缩进代码块或
    无语言围栏就会整体错位。
    """
    lang = (lang or "").strip().lower()

    if lang == "mermaid":
        # 源码放进 <code> 的文本节点里：前端读 textContent 拿到原文，
        # 既不需要在属性里转义大段图形源码，也不会有引号/尖括号的转义歧义。
        return (
            f'<pre class="{MERMAID_CLASS}"><code class="language-mermaid">'
            f"{escapeHtml(code)}</code></pre>"
        )

    filename, hl_lines = parse_fence_meta(attrs)
    try:
        lexer = get_lexer_by_name(lang, stripall=True) if lang else guess_lexer(code)
    except ClassNotFound:
        lexer = TextLexer(stripall=True)
    # hl_lines 必须给列表；给 None 会被 pygments 判为非法类型
    formatter = HtmlFormatter(
        nowrap=True,
        cssclass="highlight",
        hl_lines=hl_lines,
    )
    body = pygments_highlight(code, lexer, formatter).rstrip("\n")

    # 语言标签沿用 markdown-it 的 language-<lang> 约定，保持前端既有逻辑可用
    # escapeHtml 已包含双引号转义，无需再传 quote 参数
    code_attrs = f' class="language-{escapeHtml(lang)}"' if lang else ""
    pre_attrs = ""
    if filename:
        pre_attrs += f' data-file="{escapeHtml(filename)}"'
    if hl_lines:
        pre_attrs += f' data-hl="{",".join(str(n) for n in hl_lines)}"'
    return f"<pre{pre_attrs}><code{code_attrs}>{body}</code></pre>"


# ----------------------------------------------------------- 数学公式渲染 ---
def _register_math_rules(md: MarkdownIt) -> None:
    """覆盖 dollarmath 的默认渲染规则，产出前端可识别的稳定容器。

    默认规则会额外包一层 `<span class="math inline">`，并且把公式内容
    以 HTML 转义形态输出。前端要拿到**原始 LaTeX 文本**交给 KaTeX，
    所以这里统一改成单层容器：内容仍是转义的 HTML，
    浏览器读 textContent 即可还原成原始 LaTeX。
    """

    def render_inline(self, tokens, idx, options, env):
        content = escapeHtml(str(tokens[idx].content).strip())
        return f'<span class="{MATH_INLINE_CLASS}">{content}</span>'

    def render_block(self, tokens, idx, options, env):
        content = escapeHtml(str(tokens[idx].content).strip())
        return f'<div class="{MATH_BLOCK_CLASS}">{content}</div>\n'

    def render_block_label(self, tokens, idx, options, env):
        # 带编号的公式：$$...$$ (eq1)。编号加前缀避免与标题锚点撞 id。
        anchor = escapeHtml(f"eq-{tokens[idx].info}")
        content = escapeHtml(str(tokens[idx].content).strip())
        return f'<div class="{MATH_BLOCK_CLASS}" id="{anchor}">{content}</div>\n'

    md.add_render_rule("math_inline", render_inline)
    md.add_render_rule("math_inline_double", render_block)
    md.add_render_rule("math_block", render_block)
    md.add_render_rule("math_block_label", render_block_label)


def _build_parser() -> MarkdownIt:
    md = (
        MarkdownIt(
            "gfm-like",
            {"highlight": _highlight_code, "html": False, "linkify": _HAS_LINKIFY},
        )
        .enable(["table", "strikethrough"])
        .use(tasklists_plugin, enabled=True, label=True, label_after=False)
        .use(footnote_plugin)
        # 行内公式的严格模式：不允许 $ 紧邻空白或数字。
        # 这一条是必须的——否则 "echo $PATH and $HOME" 会被当成公式，
        # "$5 到 $10" 这类金额也会被误吞。技术博客里 shell 变量与价格
        # 出现频率远高于行内公式，宁可要求作者写成 $\alpha$ 这种紧凑形式。
        .use(
            dollarmath_plugin,
            allow_space=False,
            allow_digits=False,
            allow_labels=True,
            label_normalizer=lambda label: re.sub(r"[^A-Za-z0-9_-]", "-", label),
        )
    )
    _register_math_rules(md)
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
