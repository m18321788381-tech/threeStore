"""FastAPI 应用入口：中间件、异常、路由注册、生命周期。"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import get_db
from app.services.seo import get_feed, get_sitemap

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
)
logger = logging.getLogger("blog")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    logger.info("启动 %s (env=%s)", settings.APP_NAME, settings.APP_ENV)
    yield
    logger.info("服务已停止")


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.APP_NAME} API",
        description="个人博客后端：文章 / 分类标签 / 评论 / 数字花园",
        version="1.0.0",
        lifespan=lifespan,
        # 生产环境关闭交互式文档（设计文档 §八·敏感文件泄露）
        docs_url="/docs" if settings.APP_ENV != "production" else None,
        redoc_url="/redoc" if settings.APP_ENV != "production" else None,
        openapi_url="/openapi.json" if settings.APP_ENV != "production" else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 媒体文件静态托管（生产由 Nginx 直接 serve，这里为开发/直连兜底）
    try:
        app.mount(
            settings.MEDIA_URL if settings.MEDIA_URL.startswith("/") else "/media",
            StaticFiles(directory=settings.MEDIA_ROOT, check_dir=False),
            name="media",
        )
    except RuntimeError:  # 目录不存在时忽略，Nginx 场景无需本地目录
        logger.warning("媒体目录不存在，跳过静态挂载：%s", settings.MEDIA_ROOT)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.status_code,
                "data": None,
                "message": str(exc.detail),
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("未处理异常 %s %s", request.method, request.url)
        return JSONResponse(
            status_code=500,
            content={"code": 500, "data": None, "message": "服务器内部错误"},
        )

    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # SEO 根路径兜底：约定俗成的 /feed.xml、/sitemap.xml 也应可访问。
    # 应用路由实际挂在 /api/v1 下，此前 Nginx 精确匹配转发到无前缀路径导致 404，
    # 这里在根路径再挂一份，无论 Nginx 是否配置正确都不会失效。
    @app.get("/feed.xml", include_in_schema=False)
    async def feed_root(session: AsyncSession = Depends(get_db)):
        return Response(
            content=await get_feed(session),
            media_type="application/rss+xml; charset=utf-8",
        )

    @app.get("/sitemap.xml", include_in_schema=False)
    async def sitemap_root(session: AsyncSession = Depends(get_db)):
        return Response(
            content=await get_sitemap(session), media_type="application/xml"
        )

    @app.get("/health", tags=["meta"], summary="健康检查（Docker healthcheck）")
    async def root_health():
        return {"code": 0, "data": {"status": "ok"}, "message": "success"}

    # 存活探针：不查数据库，仅证明进程活着，供 K8s liveness 使用
    @app.get("/healthz", tags=["meta"], summary="存活探针（不依赖数据库）")
    async def liveness():
        return {"status": "ok"}

    # 就绪探针：查一次数据库，失败即 503，供负载均衡剔除流量
    @app.get("/readyz", tags=["meta"], summary="就绪探针（含数据库连通性）")
    async def readiness(session: AsyncSession = Depends(get_db)):
        try:
            await session.execute(text("SELECT 1"))
        except Exception as exc:  # pragma: no cover
            logger.error("就绪检查失败：%s", exc)
            return JSONResponse(
                status_code=503,
                content={"status": "unavailable", "reason": "database unreachable"},
            )
        return {"status": "ok", "database": "up"}

    return app


app = create_app()
