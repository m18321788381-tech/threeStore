from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class Category(UUIDPkMixin, TimestampMixin, Base):
    """分类树：parent_id 自引用支持多级。删除时文章回落到「未分类」。"""

    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )

    parent: Mapped["Category | None"] = relationship(
        remote_side="Category.id", back_populates="children", lazy="selectin"
    )
    children: Mapped[list["Category"]] = relationship(
        back_populates="parent", lazy="selectin"
    )
    posts: Mapped[list["Post"]] = relationship(  # noqa: F821
        back_populates="category", lazy="noload"
    )


__all__ = ["Category"]
