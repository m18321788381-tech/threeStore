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
    __table_args__ = (
        Index("uq_post_links_pair", "source_post_id", "target_post_id", unique=True),
        Index("ix_post_links_target", "target_post_id"),
    )

    source_post_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("posts.id", ondelete="CASCADE"), index=True
    )
    target_post_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("posts.id", ondelete="CASCADE"), index=True
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
