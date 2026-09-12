"""slug 历史映射：把旧路径解析到当前路径，供前端发 301/308。

为什么重定向由**前端（Next.js 服务端）**发出而不是这里：
    `/posts/{slug}` 是前端路由，真正的 301 必须由渲染层返回，
    这样爬虫与不执行 JS 的客户端也能拿到真实的状态码。
    后端这里只提供「旧 slug → 新 slug」的解析，前端拿到后用 permanentRedirect 跳转。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.redirect import Redirect
from app.schemas import ok
from app.services.redirects import resolve_slug

router = APIRouter(prefix="/redirects", tags=["redirects"])


@router.get("/resolve")
async def resolve(
    slug: str = Query(..., min_length=1, max_length=250, description="历史 slug"),
    session: AsyncSession = Depends(get_db),
):
    """公开：把历史 slug 解析为当前 slug。

    未命中返回 `data = {"slug": null}`，调用方据此按 404 处理。
    注意：本接口在命中时会累加一次 hit_count（见 services/redirects.py 的说明）。
    """
    return ok({"slug": await resolve_slug(session, slug)})


@router.get("")
async def list_redirects(
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """后台：审计已有重定向。

    按命中次数倒序 —— 命中为 0 的记录说明当时的旧链接从未被访问过，
    是候选清理对象；持续有命中的则必须保留。
    """
    rows = (
        (
            await session.execute(
                select(Redirect).order_by(
                    Redirect.hit_count.desc(), Redirect.created_at.desc()
                )
            )
        )
        .scalars()
        .all()
    )
    items = [
        {
            "id": str(r.id),
            "old_slug": r.old_slug,
            "new_slug": r.new_slug,
            "hit_count": r.hit_count or 0,
            "last_hit_at": r.last_hit_at,
            "created_at": r.created_at,
        }
        for r in rows
    ]
    return ok({"items": items, "total": len(items)})


__all__ = ["router"]
