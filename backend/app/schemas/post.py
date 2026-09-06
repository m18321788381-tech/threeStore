from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class TocItemOut(BaseModel):
    level: int
    text: str
    anchor: str


class PostBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=250)
    summary: str = ""
    content_md: str = ""
    cover_url: str = ""
    category_id: str | None = None
    tag_ids: list[str] = Field(default_factory=list)


class PostCreate(PostBase):
    status: int = 0  # 0=草稿 1=已发布 2=归档


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    slug: str | None = Field(default=None, max_length=250)
    summary: str | None = None
    content_md: str | None = None
    cover_url: str | None = None
    category_id: str | None = None
    tag_ids: list[str] | None = None
    status: int | None = None


class AuthorOut(BaseModel):
    id: str
    username: str
    display_name: str = ""
    avatar: str = ""


class RefOut(BaseModel):
    id: str
    name: str = ""
    slug: str = ""


class PostListItem(ORMModel):
    id: str
    title: str
    slug: str
    summary: str = ""
    cover_url: str = ""
    status: int = 0
    view_count: int = 0
    reading_time: int = 1
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    category: RefOut | None = None
    tags: list[RefOut] = Field(default_factory=list)
    author: AuthorOut | None = None
    comment_count: int = 0


class PostDetail(PostListItem):
    content_md: str = ""
    content_html: str = ""
    toc: list[TocItemOut] = Field(default_factory=list)
    prev: RefOut | None = None
    next: RefOut | None = None


class PostOut(ORMModel):
    id: str
    title: str
    slug: str
    status: int
    published_at: datetime | None = None
    updated_at: datetime | None = None


class LinksOut(BaseModel):
    outbound: list[dict] = Field(default_factory=list)
    backlinks: list[dict] = Field(default_factory=list)
