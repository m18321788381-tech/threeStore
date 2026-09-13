"""评论隐私与展示字段的回归测试（纯函数，不依赖数据库）。

覆盖两点：

1. **邮箱脱敏**。后台列表接口此前**原样返回** author_email —— 列表是批量场景，
   等于对外开了一个邮箱导出接口。现在列表走掩码，需要完整邮箱时走单条接口。
   掩码函数必须：短本地部分不泄漏任何字符、无 @ 的输入不整段回显、
   空值返回空（而不是 "undefined" 之类的噪声）。

2. **reply_to_name 必须出现在序列化结果里**，否则前端的「回复 @某某」拿不到数据。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.core.enums import CommentStatus
from app.models.comment import Comment
from app.services.comments import mask_email, to_dict


# ------------------------------------------------------------------ 邮箱掩码 ---


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("alice@example.com", "a****@example.com"),
        ("bob@example.com", "b**@example.com"),
        # 本地部分 ≤2 字符时不得泄漏任何字符
        ("ab@example.com", "**@example.com"),
        ("a@example.com", "*@example.com"),
        # 前后空白先裁掉
        ("  alice@example.com  ", "a****@example.com"),
        # 空值就是空值，不能变成占位噪声
        ("", ""),
        ("   ", ""),
    ],
)
def test_mask_email(raw: str, expected: str):
    assert mask_email(raw) == expected


def test_mask_email_never_leaks_full_local_part():
    for raw in ("alice@example.com", "bob@example.com", "charlie@x.io"):
        masked = mask_email(raw)
        local = raw.split("@")[0]
        assert local not in masked, f"{raw} 的本地部分被完整回显了：{masked}"


def test_mask_email_keeps_domain_for_identification():
    """保留域名：博主需要能确认是哪条记录，同时又不构成可用邮箱。"""
    assert mask_email("someone@corp.cn").endswith("@corp.cn")


def test_mask_email_input_without_at_is_fully_hidden():
    """畸形输入（没有 @）不能整段回显——那等于把原文当掩码返回。"""
    assert mask_email("not-an-email") == "*" * len("not-an-email")


# ------------------------------------------------------- reply_to_name 序列化 ---


def _comment(**overrides) -> Comment:
    base = dict(
        id=uuid.uuid4(),
        post_id=uuid.uuid4(),
        author_name="访客甲",
        author_email="a@b.com",
        author_site="",
        content="你好",
        status=CommentStatus.APPROVED,
        is_author=False,
        is_pinned=False,
        reply_to_name="",
    )
    base.update(overrides)
    return Comment(**base)


def test_to_dict_exposes_reply_to_name():
    payload = to_dict(_comment(reply_to_name="三石"))
    assert payload["reply_to_name"] == "三石"


def test_to_dict_reply_to_name_defaults_to_empty_string():
    """顶层评论没有被回复者，必须是 "" 而不是 None —— 前端判空只判 falsy 更省事。"""
    payload = to_dict(_comment(reply_to_name=""))
    assert payload["reply_to_name"] == ""
    assert payload["created_at"] is None or isinstance(payload["created_at"], datetime)


def test_to_dict_does_not_leak_email_to_public_payload():
    """公开评论的序列化结果里不该出现邮箱字段（列表页是匿名可见的）。"""
    payload = to_dict(_comment())
    assert "author_email" not in payload
    assert "ip_address" not in payload


def test_to_dict_marks_parent_id():
    parent = uuid.uuid4()
    payload = to_dict(_comment(parent_id=parent))
    assert payload["parent_id"] == str(parent)


def test_to_dict_created_at_passthrough():
    now = datetime(2026, 9, 13, 10, 0, tzinfo=timezone.utc)
    assert to_dict(_comment(created_at=now))["created_at"] == now
