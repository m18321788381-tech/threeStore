from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class MediaOut(ORMModel):
    id: str
    filename: str
    url: str
    mime_type: str = ""
    size: int = 0
    created_at: datetime | None = None


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
    views_last_7d: int = 0
    link_count: int = 0


class HealthOut(BaseModel):
    status: str = "ok"
    app: str = ""
    env: str = ""


class GraphOut(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []
