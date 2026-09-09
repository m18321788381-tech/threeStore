"""搜索辅助：中文友好的分词、相关度打分与命中片段高亮。

为什么不用 PostgreSQL 自带的 tsvector / to_tsvector：
    Postgres 的默认分词器按空格与标点切词，中文整句没有任何空格，
    「部署Docker容器」会被当成一个不可切分的 token，既无法命中「Docker」，
    也无法命中「容器」。这是中文站全文检索最常见的失效原因。

这里的做法（不引入额外服务即可用）：
    * 关键词切分：英文/数字按词切，中文按连续 CJK 段切，并额外产出二元组（bigram）
      作为召回补充——「容器化部署」能召回只出现「容器」的文章。
    * 召回策略：先 AND（全部词命中，最准），无结果再 OR（任一词命中，放宽），
      最后用 pg_trgm 的 similarity() 做模糊兜底（错别字 / 部分词）。
    * 排序：标题命中 > 摘要命中 > 正文命中，同分再用发布时间。
    * 高亮：服务端生成带 <mark> 的片段，前端直接渲染，避免把正文全量下发。

若要进一步升级到 Meilisearch / Elasticsearch，只需替换本模块的 term 生成与
查询构造，接口契约（keyword / items / highlight）保持不变。
"""
from __future__ import annotations

import html
import re
from typing import Iterable

# CJK 统一表意文字 + 扩展区 + 中日韩假名/谚文
_CJK = r"\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af"
_CJK_RUN = re.compile(rf"[{_CJK}]+")
_TOKEN = re.compile(rf"[{_CJK}]+|[A-Za-z0-9_+#.\-]+")
_NOISE = {"的", "了", "和", "与", "及", "在", "是", "有", "我", "你", "他", "这", "那"}

MD_FENCE = re.compile(r"```.*?```", re.S)
MD_INLINE_CODE = re.compile(r"`[^`\n]*`")
MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s*", re.M)
MD_MARKS = re.compile(r"[*_>~|]+")
MD_TABLE_SEP = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", re.M)


def tokenize(keyword: str, max_terms: int = 8, expand: bool = True) -> list[str]:
    """把用户输入的关键词切成可用于 ILIKE 匹配的词元。

    - 拉丁文/数字按整词保留；
    - CJK 连续段整体保留（精确短语）；`expand=True` 时额外补二元组用于召回，
      例如「容器化部署」能召回只出现「容器」的文章。
    - 去掉高频虚词：它们几乎每篇都命中，只会稀释排序。

    调用方通常要两份：expand=False 的「主词」用于 AND 精确召回，
    expand=True 的全量词用于 OR 放宽召回与高亮。
    """
    keyword = (keyword or "").strip()
    if not keyword:
        return []

    raw = [t for t in _TOKEN.findall(keyword) if t.strip()]
    has_latin = any(not _CJK_RUN.fullmatch(t) for t in raw)

    terms: list[str] = []
    seen: set[str] = set()

    def push(value: str) -> None:
        v = value.strip()
        if not v or v in seen:
            return
        seen.add(v)
        terms.append(v)

    for token in raw:
        if _CJK_RUN.fullmatch(token):
            push(token)
            # 长中文串补二元组：用户常常输入一整句，逐字匹配太噪、整句匹配又太严
            if expand and len(token) >= 3:
                for i in range(len(token) - 1):
                    if len(terms) >= max_terms:
                        break
                    push(token[i : i + 2])
        else:
            push(token)

    # 纯中文且只有单字时补回来；纯拉丁词不再拆
    if not terms and raw:
        push(max(raw, key=len))
    # 去掉高频虚词：它们几乎每篇都命中，只会稀释排序
    if has_latin or len(terms) > 1:
        terms = [t for t in terms if t not in _NOISE] or terms

    return terms[:max_terms]


def strip_markdown(content: str) -> str:
    """把 Markdown 正文压成纯文本，供片段截取使用。"""
    if not content:
        return ""
    text = MD_FENCE.sub(" ", content)
    text = MD_INLINE_CODE.sub(" ", text)
    text = MD_IMAGE.sub(" ", text)
    text = MD_LINK.sub(r"\1", text)
    text = MD_TABLE_SEP.sub(" ", text)
    text = MD_HEADING.sub(" ", text)
    text = MD_MARKS.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def highlight(text: str, terms: Iterable[str]) -> str:
    """转义后把命中的词元包进 <mark>。

    先切段再逐段转义，绝不在已转义的字符串上做替换，
    因此用户输入的 <script> 之类内容只会被当成普通文本。
    """
    if not text:
        return ""
    cleaned = [t for t in terms if t]
    if not cleaned:
        return html.escape(text)

    pattern = "|".join(re.escape(t) for t in sorted(cleaned, key=len, reverse=True))
    parts = re.split(f"({pattern})", text, flags=re.I)
    out: list[str] = []
    for index, part in enumerate(parts):
        # re.split 带捕获组时，奇数下标即命中片段
        if index % 2 == 1:
            out.append(f'<mark class="kw">{html.escape(part)}</mark>')
        else:
            out.append(html.escape(part))
    return "".join(out)


def build_snippet(
    content_md: str, terms: list[str], summary: str = "", width: int = 80
) -> str:
    """生成命中上下文片段：优先正文，正文中没命中则退回摘要开头。"""
    text = strip_markdown(content_md)
    lowered = text.lower()

    hit_at = -1
    for term in terms:
        idx = lowered.find(term.lower())
        if idx >= 0 and (hit_at < 0 or idx < hit_at):
            hit_at = idx

    if hit_at >= 0:
        start = max(0, hit_at - width // 2)
        end = min(len(text), hit_at + width * 2)
        snippet = text[start:end]
        prefix = "…" if start > 0 else ""
        suffix = "…" if end < len(text) else ""
        return highlight(prefix + snippet + suffix, terms)

    fallback = (summary or text)[: width * 2]
    return highlight(fallback, terms)


__all__ = ["tokenize", "strip_markdown", "highlight", "build_snippet"]
