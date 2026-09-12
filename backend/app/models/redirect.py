from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class Redirect(UUIDPkMixin, TimestampMixin, Base):
    """slug 历史映射：文章改 slug 后，旧路径应 301 到新路径。

    为什么**不挂** post_id 外键：
      旧链接的价值恰恰在文章被删除后依然存在（至少要能给出明确响应而不是 404）。
      挂 FK 会让记录随文章 CASCADE 一起消失，等于白记。

    只覆盖 slug 维度（不含分类/标签改名）：
      `/posts/{slug}` 是唯一会被作者频繁修改的路径；分类/标签改名频率极低，
      真要做时把 old_slug/new_slug 泛化为 old_path/new_path 即可，不影响现有数据。

    写入策略见 `app/services/redirects.py::record_slug_change`：
    记录会被**扁平化**（A→B 之后 B→C，则旧的 A→B 会被改写成 A→C），
    因此查一次即可命中，不存在多跳链。
    """

    __tablename__ = "redirects"
    __table_args__ = (
        Index("uq_redirects_old_slug", "old_slug", unique=True),
        Index("ix_redirects_new_slug", "new_slug"),
    )

    old_slug: Mapped[str] = mapped_column(String(250), nullable=False)
    new_slug: Mapped[str] = mapped_column(String(250), nullable=False)
    # 命中计数：用来判断某条重定向是否还有真实流量，决定能不能安全删掉。
    # server_default 与 0003 迁移保持一致，否则 alembic autogenerate 会一直报「默认值差异」。
    hit_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_hit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


__all__ = ["Redirect"]
