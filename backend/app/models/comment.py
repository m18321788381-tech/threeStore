from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import CommentStatus
from app.models.base import Base, TimestampMixin, UUIDPkMixin


class Comment(UUIDPkMixin, TimestampMixin, Base):
    """评论：parent_id 自引用实现楼中楼多级回复。"""

    __tablename__ = "comments"
    __table_args__ = (
        Index("ix_comments_post_status_created", "post_id", "status", "created_at"),
        Index("ix_comments_parent", "parent_id"),
    )

    post_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("posts.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    )

    author_name: Mapped[str] = mapped_column(String(50), default="匿名访客")
    author_email: Mapped[str] = mapped_column(String(255), default="")
    author_site: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)

    ip_address: Mapped[str] = mapped_column(String(45), default="")
    user_agent: Mapped[str] = mapped_column(String(500), default="")

    status: Mapped[int] = mapped_column(SmallInteger, default=CommentStatus.PENDING)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_author: Mapped[bool] = mapped_column(Boolean, default=False)  # 博主评论

    post: Mapped["Post"] = relationship(  # noqa: F821
        back_populates="comments", lazy="noload"
    )
    # 注意：树状结构在 service 层用一次扁平查询后递归组装（避免 selectin 递归查询放大）
    replies: Mapped[list["Comment"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    parent: Mapped["Comment | None"] = relationship(
        back_populates="replies", remote_side="Comment.id", lazy="noload"
    )


__all__ = ["Comment"]
