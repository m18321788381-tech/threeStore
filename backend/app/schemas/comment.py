from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    author_name: str = Field(default="匿名访客", max_length=50)
    author_email: str | None = Field(default=None, max_length=255)
    author_site: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=1, max_length=2000)
    parent_id: str | None = None


class CommentUpdate(BaseModel):
    content: str | None = Field(default=None, max_length=2000)
    status: int | None = None
    is_pinned: bool | None = None


class CommentNode(BaseModel):
    id: str
    author_name: str = ""
    author_site: str = ""
    content: str = ""
    created_at: datetime | None = None
    parent_id: str | None = None
    is_author: bool = False
    is_pinned: bool = False
    status: int = 0
    replies: list["CommentNode"] = Field(default_factory=list)


class CommentAdminItem(CommentNode):
    post_slug: str = ""
    post_title: str = ""
    author_email: str = ""
    ip_address: str = ""

    @classmethod
    def from_node(cls, node: dict, **extra) -> "CommentAdminItem":
        return cls(
            id=node["id"],
            author_name=node.get("author_name", ""),
            author_site=node.get("author_site", ""),
            content=node.get("content", ""),
            created_at=node.get("created_at"),
            parent_id=node.get("parent_id"),
            is_author=node.get("is_author", False),
            is_pinned=node.get("is_pinned", False),
            status=node.get("status", 0),
            replies=[],
            **extra,
        )


CommentNode.model_rebuild()
