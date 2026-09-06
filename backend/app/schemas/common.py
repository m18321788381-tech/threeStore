"""统一响应信封与分页结构（对应设计文档 §2.3）。"""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    data: T | None = None
    message: str = "success"


class Paginated(BaseModel, Generic[T]):
    items: list[T] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 10
    pages: int = 0


def ok(data=None, message: str = "success", code: int = 0) -> dict:
    """成功响应构造器（保持与 ApiResponse 完全一致的字段顺序）。"""
    return {"code": code, "data": data, "message": message}


def paginate(items, total: int, page: int, page_size: int) -> dict:
    pages = (total + page_size - 1) // page_size if page_size else 0
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
