"""全局配置：全部从环境变量 / .env 读取，绝不硬编码密钥。"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ---------------------------------------------------------------------------
# 安全基线：这些值一旦出现在生产环境即为致命配置错误。
# 曾出现过「默认口令 + 默认 JWT 密钥直接上生产，站点可被任意接管」的事故，
# 因此这里做 fail-fast：宁可启动失败，也不能带着默认凭据对外服务。
# ---------------------------------------------------------------------------
INSECURE_DEFAULTS: frozenset[str] = frozenset(
    {
        "change-me-in-production",
        "change-me-jwt",
        "admin",
        "admin12345",
        "changeme",
        "secret",
        "password",
        "123456",
    }
)
MIN_SECRET_LENGTH = 32
MIN_ADMIN_PASSWORD_LENGTH = 12


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
    # SVG 是 XML，可内嵌 <script> 造成存储型 XSS，默认关闭上传。
    # 确需使用时置为 true，系统会强制走 XML 净化（剔除脚本、事件属性、外部引用）。
    ALLOW_SVG_UPLOAD: bool = False

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
    COMMENT_RATE_LIMIT: int = 10  # 同一 IP 在该窗口内最多 N 条（原为 3，过于严格易误伤）
    COMMENT_RATE_WINDOW: int = 600  # 秒
    COMMENT_MAX_LINKS: int = 2
    COMMENT_SENSITIVE_WORDS: str = ""

    # ---------- 登录防爆破 ----------
    # 同一 IP 在窗口内失败 N 次即锁定；另按「IP + 用户名」单独计数，
    # 防止针对单个账号的分布式慢速爆破。
    LOGIN_FAIL_LIMIT: int = 5  # 同一 IP 窗口内允许的失败次数
    LOGIN_FAIL_WINDOW: int = 900  # 秒（15 分钟）
    LOGIN_LOCK_SECONDS: int = 900  # 秒：触发后的锁定时长
    LOGIN_FAIL_LIMIT_PER_ACCOUNT: int = 5  # 同一 IP+账号维度
    LOGIN_GLOBAL_LIMIT: int = 30  # 同一 IP 窗口内总尝试次数（成功+失败）
    LOGIN_GLOBAL_WINDOW: int = 900  # 秒

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

    # ------------------------------------------------------------------
    # 安全基线校验：生产环境必须使用真实密钥与强口令，否则拒绝启动。
    # ------------------------------------------------------------------
    @model_validator(mode="after")
    def _reject_insecure_defaults(self) -> "Settings":
        if self.APP_ENV != "production":
            return self

        problems: list[str] = []

        for name in ("SECRET_KEY", "JWT_SECRET"):
            value = getattr(self, name)
            if value.strip().lower() in INSECURE_DEFAULTS:
                problems.append(
                    f"{name} 仍为默认占位值，请执行 `openssl rand -hex 32` 生成后写入 .env"
                )
            elif len(value) < MIN_SECRET_LENGTH:
                problems.append(
                    f"{name} 长度不足 {MIN_SECRET_LENGTH} 位（当前 {len(value)} 位），"
                    "请用 `openssl rand -hex 32` 生成"
                )

        if self.ADMIN_PASSWORD.strip().lower() in INSECURE_DEFAULTS:
            problems.append("ADMIN_PASSWORD 仍为默认口令，生产环境必须修改")
        elif len(self.ADMIN_PASSWORD) < MIN_ADMIN_PASSWORD_LENGTH:
            problems.append(
                f"ADMIN_PASSWORD 长度不足 {MIN_ADMIN_PASSWORD_LENGTH} 位"
                f"（当前 {len(self.ADMIN_PASSWORD)} 位）"
            )

        if "localhost" in self.SITE_URL or "127.0.0.1" in self.SITE_URL:
            problems.append(
                "SITE_URL 指向 localhost，会导致 RSS / Sitemap / OG 卡片全部失效，"
                "请设置为真实访问地址（如 https://your-domain.com）"
            )

        if self.SECRET_KEY == self.JWT_SECRET:
            problems.append("SECRET_KEY 与 JWT_SECRET 不得使用同一取值")

        if problems:
            detail = "\n  - ".join(problems)
            raise ValueError(
                f"生产环境安全校验未通过，已拒绝启动：\n  - {detail}\n"
                "若确需在本地以生产模式验证，请设置 APP_ENV=development。"
            )
        return self

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
