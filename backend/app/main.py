"""FastAPI 应用入口：中间件、异常、路由注册、生命周期。"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings

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

    @app.get("/health", tags=["meta"], summary="健康检查（Docker healthcheck）")
    async def root_health():
        return {"code": 0, "data": {"status": "ok"}, "message": "success"}

    return app


app = create_app()
