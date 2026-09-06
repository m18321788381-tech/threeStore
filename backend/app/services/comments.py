"""评论服务：扁平查询结果 -> 楼中楼树；以及反垃圾校验。"""
from __future__ import annotations

import re
from collections.abc import Sequence

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.rate_limit import hit
from app.models.comment import Comment

_LINK_RE = re.compile(r"https?://", re.I)


def to_dict(c: Comment) -> dict:
    return {
        "id": str(c.id),
        "author_name": c.author_name,
        "author_site": c.author_site,
        "content": c.content,
        "created_at": c.created_at,
        "parent_id": str(c.parent_id) if c.parent_id else None,
        "is_author": c.is_author,
        "is_pinned": c.is_pinned,
        "status": c.status,
        "replies": [],
    }


def build_tree(comments: Sequence[Comment]) -> list[dict]:
    """一次遍历组装成嵌套树。父评论：置顶优先 + 时间倒序；回复：时间正序。"""
    nodes = {str(c.id): to_dict(c) for c in comments}
    roots: list[dict] = []

    for c in comments:
        node = nodes[str(c.id)]
        if c.parent_id and str(c.parent_id) in nodes:
            nodes[str(c.parent_id)]["replies"].append(node)
        else:
            roots.append(node)

    def _sort(items: list[dict], top_level: bool) -> None:
        if top_level:
            # 置顶优先，其余按时间倒序（最新在前）
            items.sort(key=lambda n: (not n["is_pinned"], -n["created_at"].timestamp()))
        else:
            items.sort(key=lambda n: n["created_at"])
        for it in items:
            _sort(it["replies"], False)

    _sort(roots, True)
    return roots


def count_all(tree: Sequence[dict]) -> int:
    total = 0
    for node in tree:
        total += 1 + count_all(node["replies"])
    return total


def validate_comment(content: str, ip: str) -> None:
    """反垃圾：长度 + 链接数 + 敏感词 + IP 频率限制。"""
    text = (content or "").strip()
    if len(text) < settings.COMMENT_MIN_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="评论内容太短了"
        )
    if len(text) > settings.COMMENT_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"评论内容超出 {settings.COMMENT_MAX_LEN} 字上限",
        )

    links = len(_LINK_RE.findall(text))
    if links > settings.COMMENT_MAX_LINKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="链接过多，疑似垃圾评论",
        )

    for word in settings.sensitive_words_list:
        if word and word in text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="评论包含敏感词，请修改后重试",
            )

    if not hit(f"comment:{ip}", settings.COMMENT_RATE_LIMIT, settings.COMMENT_RATE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="评论太频繁了，请稍后再试",
        )
