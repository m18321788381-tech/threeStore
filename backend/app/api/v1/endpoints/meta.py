"""SEO 与运维端点：RSS / Sitemap / 健康检查。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.schemas import HealthOut, ok
from app.services.seo import get_feed, get_sitemap

router = APIRouter(tags=["meta"])


@router.get("/health")
async def health():
    return ok(
        HealthOut(
            status="ok", app=settings.APP_NAME, env=settings.APP_ENV
        ).model_dump()
    )


@router.get("/feed.xml")
async def rss_feed(session: AsyncSession = Depends(get_db)):
    return Response(
        content=await get_feed(session),
        media_type="application/rss+xml; charset=utf-8",
    )


@router.get("/sitemap.xml")
async def sitemap(session: AsyncSession = Depends(get_db)):
    return Response(
        content=await get_sitemap(session), media_type="application/xml"
    )


__all__ = ["router"]
