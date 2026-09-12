from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPkMixin


class PostLink(UUIDPkMixin, Base):
    """数字花园双向链接：source 用 [[...]] 引用了 target。

    关系有方向、查询双向：
      - outbound: WHERE source_post_id = ?  （本文引用了谁）
      - backlinks: WHERE target_post_id = ? （谁引用了本文）
    """

    __tablename__ = "post_links"
    # 索引名与 0001 迁移逐字对齐（`ix_post_links_source` / `ix_post_links_target`）。
    # 早期这里靠列上的 index=True 隐式生成，名字会变成 `ix_post_links_source_post_id`，
    # 既与线上 DB 里的真实索引名不符，又会在 target_post_id 上叠出一条重复索引
    # （隐式一条 + 显式一条），所以改为全部显式声明。
    __table_args__ = (
        Index("uq_post_links_pair", "source_post_id", "target_post_id", unique=True),
        Index("ix_post_links_source", "source_post_id"),
        Index("ix_post_links_target", "target_post_id"),
    )

    source_post_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("posts.id", ondelete="CASCADE")
    )
    target_post_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("posts.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    source_post: Mapped["Post"] = relationship(  # noqa: F821
        back_populates="outbound_links",
        foreign_keys=[source_post_id],
        lazy="noload",
    )
    target_post: Mapped["Post"] = relationship(  # noqa: F821
        back_populates="inbound_links",
        foreign_keys=[target_post_id],
        lazy="noload",
    )


__all__ = ["PostLink"]
