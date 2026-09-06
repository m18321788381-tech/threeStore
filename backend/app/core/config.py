"""全局配置：全部从环境变量 / .env 读取，绝不硬编码密钥。"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ---------- App ----------
    APP_ENV: Literal["development", "production", "test"] = "development"
    DEBUG: bool = True
    APP_NAME: str = "个人博客"
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_HOSTS: str = "*"
    API_V1_PREFIX: str = "/api/v1"

    # ---------- JWT ----------
    JWT_SECRET: str = "change-me-jwt"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE: int = 30  # 分钟
    REFRESH_TOKEN_EXPIRE: int = 720  # 分钟 (12h)

    # ---------- Database ----------
    DB_HOST: str = "db"
    DB_PORT: int = 5432
    DB_USER: str = "blog"
    DB_PASSWORD: str = "blog"
    DB_NAME: str = "blog"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # ---------- Media ----------
    MEDIA_ROOT: str = "/app/media"
    MEDIA_URL: str = "/media"
    MAX_UPLOAD_MB: int = 10

    # ---------- CORS ----------
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = "*"

    # ---------- Site (RSS / Sitemap / OG) ----------
    SITE_URL: str = "http://localhost"
    SITE_TITLE: str = "个人博客"
    SITE_DESCRIPTION: str = "一个内容驱动的个人技术博客"
    SITE_AUTHOR: str = "博主"
    SITE_LOCALE: str = "zh-CN"

    # ---------- Anti-spam ----------
    COMMENT_MIN_LEN: int = 2
    COMMENT_MAX_LEN: int = 2000
    COMMENT_RATE_LIMIT: int = 3  # 同一 IP 在该窗口内最多 N 条
    COMMENT_RATE_WINDOW: int = 300  # 秒
    COMMENT_MAX_LINKS: int = 2
    COMMENT_SENSITIVE_WORDS: str = ""

    # ---------- Pagination ----------
    DEFAULT_PAGE_SIZE: int = 10
    MAX_PAGE_SIZE: int = 50

    # ---------- Admin bootstrap ----------
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "admin12345"
    ADMIN_DISPLAY_NAME: str = "博主"

    # ---------- Redis（可选；留空则全部降级） ----------
    # worker 用它缓存 RSS/Sitemap 并接收「内容变更」事件；
    # 后端也用它做 SEO 产物缓存。REDIS_URL 为空时回退到按需生成。
    REDIS_URL: str = ""
    WORKER_REFRESH_INTERVAL: int = 300  # 秒：worker 周期刷新 SEO 缓存
    SEO_CACHE_TTL: int = 3600  # 秒：RSS/Sitemap 缓存有效期

    # ---------- Logging ----------
    LOG_LEVEL: str = "DEBUG"

    @property
    def database_url(self) -> str:
        """异步 DSN（asyncpg）。"""
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def sync_database_url(self) -> str:
        """Alembic 离线迁移用的同步 DSN（psycopg 由 alembic env 自行导入）。"""
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.ALLOWED_HOSTS.split(",") if h.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def sensitive_words_list(self) -> list[str]:
        return [w.strip() for w in self.COMMENT_SENSITIVE_WORDS.split(",") if w.strip()]

    docs_enabled: bool = Field(default=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
