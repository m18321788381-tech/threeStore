from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserRole
from app.models.base import Base, TimestampMixin, UUIDPkMixin


class User(UUIDPkMixin, TimestampMixin, Base):
    """博主账号（MVP 单作者，但保留 role 字段便于扩展）。"""

    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100), default="")
    avatar: Mapped[str] = mapped_column(String(500), default="")
    bio: Mapped[str] = mapped_column(String(1000), default="")
    role: Mapped[int] = mapped_column(Integer, default=UserRole.ADMIN)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # noload：没有任何读取方，但 selectin 会让「每次鉴权 session.get(User)」都把该作者
    # 的全部文章（连带 tags）捞出来，鉴权开销随文章数线性增长。
    posts: Mapped[list["Post"]] = relationship(  # noqa: F821
        back_populates="author", lazy="noload"
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


__all__ = ["User"]
