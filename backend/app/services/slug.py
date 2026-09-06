"""Slug 生成：优先可读英文，中文标题自动降级为带随机后缀的稳定 slug。"""
from __future__ import annotations

import re
import uuid

from slugify import slugify as _slugify

_FALLBACK_PREFIX = "post"


def slugify_title(title: str, max_len: int = 80) -> str:
    slug = _slugify(title or "", max_length=max_len)
    if slug:
        return slug
    # 中文/纯符号标题：保留中文字符（URL 中会被百分号编码但可读），去掉危险字符
    cleaned = re.sub(r"[^\w\u4e00-\u9fff\- ]", "", (title or "").strip())
    cleaned = re.sub(r"\s+", "-", cleaned)
    if cleaned:
        return cleaned[:max_len]
    return f"{_FALLBACK_PREFIX}-{uuid.uuid4().hex[:8]}"


def unique_slug(base: str, used: set[str]) -> str:
    """在已占用集合里保证唯一。"""
    if base not in used:
        return base
    for i in range(2, 100):
        candidate = f"{base}-{i}"
        if candidate not in used:
            return candidate
    return f"{base}-{uuid.uuid4().hex[:6]}"
