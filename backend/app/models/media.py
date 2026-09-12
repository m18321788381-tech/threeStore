from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class Media(UUIDPkMixin, TimestampMixin, Base):
    """上传的图片/附件记录。

    width / height 必须由上传时写入：前端据此输出 `width`/`height` 属性，
    否则图片加载时无法预留占位空间，会产生 CLS（布局偏移）。
    content_hash 是落盘字节的 sha256，用于「同图不重复落盘」与后续清理孤儿文件。
    """

    __tablename__ = "media"

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    # 图片替代文本：入库后可由编辑器在插入图片时回填，服务无障碍与图片 SEO
    alt: Mapped[str] = mapped_column(String(255), default="")
    mime_type: Mapped[str] = mapped_column(String(100), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str] = mapped_column(String(64), default="", index=True)
    uploader_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class PostStat(UUIDPkMixin, TimestampMixin, Base):
    """阅读量统计（拆分表，便于后续异步批量写，避免更新 posts 主表造成锁竞争）。

    注意：like_count 已移除 —— 本站产品立场明确「没有点赞」（见 about 页），
    保留该列只会让后来者误以为存在点赞功能。

    ⚠️ 当前状态（2026-09-11 走查结论）：本表只有写入点（`posts.py` 的阅读量自增），
    **没有任何读取点** —— 列表、排序、后台汇总全部读 `posts.view_count`。
    它目前是「双份真相」的一半。收敛方案（二选一，未决）：
      ① 删除本表，让 posts.view_count 成为唯一真源；
      ② 升级为唯一真源，并补日粒度表支撑趋势统计。
    在收敛完成前，请勿新增对本表的读取依赖。
    """

    __tablename__ = "post_stats"

    post_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("posts.id", ondelete="CASCADE"), unique=True, index=True
    )
    view_count: Mapped[int] = mapped_column(Integer, default=0)


__all__ = ["Media", "PostStat"]
