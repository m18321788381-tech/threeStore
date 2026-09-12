from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
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
        # 列表页固定按「置顶优先」排序，三列复合索引正好覆盖
        # WHERE status = ? ORDER BY is_pinned DESC, published_at DESC。
        # 上面的两列索引仍保留：归档页只按 published_at 排序，用不上这个三列索引。
        Index("ix_posts_status_pinned_published", "status", "is_pinned", "published_at"),
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
    # 注意：这里刻意不给 status 加 index=True。
    # `ix_posts_status_published_at` 是 (status, published_at) 复合索引，status 已是最左前缀，
    # 单独再建一条 ix_posts_status 属冗余；0001 迁移也从未创建过它。
    status: Mapped[int] = mapped_column(SmallInteger, default=PostStatus.DRAFT)
    # ---- SEO 覆盖项：留空/关时完全走全站默认规则，不产生任何行为差异 ----
    # canonical_url 用于转载、合作稿、多域名镜像等场景显式指定规范链接；
    # noindex 用于「已发布但不希望被收录」的内容（如临时公告、内部文档）。
    canonical_url: Mapped[str] = mapped_column(String(500), default="")
    noindex: Mapped[bool] = mapped_column(Boolean, default=False)
    # 置顶：仅影响列表页排序（始终排在最前），不影响归档与 RSS 的时序
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
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
