from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Uuid,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import PostStatus
from app.models.base import Base, TimestampMixin, UUIDPkMixin
from app.models.tag import post_tags


class Post(UUIDPkMixin, TimestampMixin, Base):
    """文章主表。content_md 为可信源，content_html 为预渲染缓存。"""

    __tablename__ = "posts"
    __table_args__ = (
        Index("ix_posts_status_published_at", "status", "published_at"),
    )

    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(250), unique=True, index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    content_md: Mapped[str] = mapped_column(Text, default="")
    content_html: Mapped[str] = mapped_column(Text, default="")
    toc: Mapped[str] = mapped_column(Text, default="")  # TOC 的 JSON 缓存
    cover_url: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[int] = mapped_column(
        SmallInteger, default=PostStatus.DRAFT, index=True
    )
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    reading_time: Mapped[int] = mapped_column(Integer, default=1)  # 分钟
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )

    author: Mapped["User"] = relationship(  # noqa: F821
        back_populates="posts", lazy="joined"
    )
    category: Mapped["Category | None"] = relationship(  # noqa: F821
        back_populates="posts", lazy="joined"
    )
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        secondary=post_tags, back_populates="posts", lazy="selectin"
    )
    comments: Mapped[list["Comment"]] = relationship(  # noqa: F821
        back_populates="post", cascade="all, delete-orphan", lazy="noload"
    )
    outbound_links: Mapped[list["PostLink"]] = relationship(  # noqa: F821
        foreign_keys="PostLink.source_post_id",
        back_populates="source_post",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    inbound_links: Mapped[list["PostLink"]] = relationship(  # noqa: F821
        foreign_keys="PostLink.target_post_id",
        back_populates="target_post",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    @property
    def is_published(self) -> bool:
        return self.status == PostStatus.PUBLISHED


__all__ = ["Post"]
