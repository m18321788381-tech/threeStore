"""可选的 Redis 客户端。

设计原则：REDIS_URL 为空、或运行环境未安装 redis 库时，所有接口**静默降级**
（返回 None / 无操作），不阻塞主流程。这样不接 Redis 的部署也能正常运行。
"""
from __future__ import annotations

from typing import Optional

from app.core.config import settings

try:  # 未安装 redis 也能 import（降级为 None）
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    aioredis = None

# SEO 产物缓存键 与 失效事件频道
CACHE_KEYS = {
    "feed": "blog:cache:feed",
    "sitemap": "blog:cache:sitemap",
}
INVALIDATE_CHANNEL = "blog:seo:invalidate"

_client = None


def get_redis() -> Optional["aioredis.Redis"]:
    """返回单例 Redis 客户端；未配置则返回 None。"""
    global _client
    if not settings.REDIS_URL or aioredis is None:
        return None
    if _client is None:
        _client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


async def cache_get(key: str) -> Optional[str]:
    r = get_redis()
    if not r:
        return None
    try:
        return await r.get(key)
    except Exception:
        return None


async def cache_set(key: str, value: str, ttl: int) -> None:
    r = get_redis()
    if not r:
        return
    try:
        await r.set(key, value, ex=ttl)
    except Exception:
        pass


async def publish(channel: str, message: str = "") -> None:
    """发布到频道；无 Redis 时为无操作。"""
    r = get_redis()
    if not r:
        return
    try:
        await r.publish(channel, message)
    except Exception:
        pass


async def subscribe(channel: str):
    """订阅频道，返回 pubsub 对象；失败返回 None。"""
    r = get_redis()
    if not r:
        return None
    try:
        ps = r.pubsub()
        await ps.subscribe(channel)
        return ps
    except Exception:
        return None
