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

    # 令牌代次。JWT 里带上它，鉴权时与这里比对，不等即视为已吊销。
    #
    # 为什么需要：JWT 是自包含的，签发后服务端**无法单独作废**。此前改密码后旧
    # access token 仍能用到自然过期（最长 ACCESS_TOKEN_EXPIRE 分钟），
    # refresh token 更是可以一直换新 —— 密码泄露后改密码并不能把攻击者踢出去。
    # 递增这个整数，等于一次性作废**该用户已签发的全部**令牌（所有设备）。这不是缺陷
    # 而是选择：单枚令牌级吊销需要引入 denylist 存储，代价远大于本站所需。
    #
    # 缺省 0：升级上线时不改动任何存量行为 —— 老 token 里没有 ver 声明，
    # 读取端按 0 处理，仍与库里的 0 相等，因此**不会**把所有在线用户静默登出。
    token_version: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )

    # noload：没有任何读取方，但 selectin 会让「每次鉴权 session.get(User)」都把该作者
    # 的全部文章（连带 tags）捞出来，鉴权开销随文章数线性增长。
    posts: Mapped[list["Post"]] = relationship(  # noqa: F821
        back_populates="author", lazy="noload"
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


__all__ = ["User"]
