from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    description: str = ""
    parent_id: str | None = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = None
    parent_id: str | None = None


class CategoryOut(ORMModel):
    id: str
    name: str
    slug: str
    description: str = ""
    parent_id: str | None = None
    post_count: int = 0


class TagBase(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    slug: str | None = Field(default=None, max_length=80)


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=50)
    slug: str | None = Field(default=None, max_length=80)


class TagOut(ORMModel):
    id: str
    name: str
    slug: str
    post_count: int = 0
