from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class MediaOut(ORMModel):
    id: str
    filename: str
    url: str
    alt: str = ""
    mime_type: str = ""
    size: int = 0
    width: int = 0
    height: int = 0
    created_at: datetime | None = None


class MediaUpdate(BaseModel):
    """媒体元数据更新（PATCH 语义：仅传需要改的字段）。"""

    alt: str | None = Field(default=None, max_length=255)


class StatsOverview(BaseModel):
    post_count: int = 0
    published_count: int = 0
    draft_count: int = 0
    comment_count: int = 0
    pending_comment_count: int = 0
    category_count: int = 0
    tag_count: int = 0
    media_count: int = 0
    total_views: int = 0
    link_count: int = 0
    # 注：曾有 views_last_7d 字段，取值实为累计量（假数据），已移除。
    # 7 日趋势待第二期 PageView 访问事件表落地后再提供。


class HealthOut(BaseModel):
    status: str = "ok"
    app: str = ""
    env: str = ""


class GraphOut(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []
