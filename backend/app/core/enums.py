"""全局枚举（以 smallint 落库，便于索引与排序）。"""
from __future__ import annotations

from enum import IntEnum


class PostStatus(IntEnum):
    DRAFT = 0
    PUBLISHED = 1
    ARCHIVED = 2


class CommentStatus(IntEnum):
    PENDING = 0  # 待审核
    APPROVED = 1  # 已通过
    REJECTED = 2  # 已驳回
    SPAM = 3  # 垃圾


class UserRole(IntEnum):
    ADMIN = 0  # 博主（唯一内容生产者）
    READER = 1  # 预留：未来多角色扩展
