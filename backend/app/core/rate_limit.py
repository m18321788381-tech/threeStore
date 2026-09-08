"""限流：Redis 优先，未配置 REDIS_URL 时降级为进程内内存实现。

设计取舍：
- **Redis 模式**：多副本部署共享计数，重启不丢，适合登录锁定这类安全场景。
- **内存模式**：单进程够用，但各副本计数独立、重启清零 —— 仅作无 Redis 时的兜底。

因此 `ahit()` 为推荐入口（异步、自动选路）；同步 `hit()` 保留给无需 Redis 的场景。
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from app.core.cache import get_redis

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def hit(key: str, limit: int, window: int) -> bool:
    """记录一次访问；返回 True 表示允许（未超限）。纯内存实现。"""
    now = time.monotonic()
    bucket = _BUCKETS[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        return False
    bucket.append(now)
    return True


def remaining(key: str, limit: int, window: int) -> int:
    now = time.monotonic()
    bucket = _BUCKETS[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    return max(0, limit - len(bucket))


def reset(key: str) -> None:
    """清除某个键的计数（登录成功后调用）。"""
    _BUCKETS.pop(key, None)


# ---------------------------------------------------------------------------
# 异步入口：Redis 优先
# ---------------------------------------------------------------------------


async def ahit(key: str, limit: int, window: int) -> bool:
    """异步计数一次；返回 True 表示允许（未超限）。

    Redis 可用时使用原子 INCR + EXPIRE，避免多副本各算各的。
    Redis 不可用或出错时静默降级到内存实现，绝不因限流组件故障阻断业务。
    """
    r = get_redis()
    if r is not None:
        try:
            rkey = f"blog:ratelimit:{key}"
            count = await r.incr(rkey)
            if count == 1:
                await r.expire(rkey, window)
            return count <= limit
        except Exception:  # Redis 抖动时降级，不能让限流拖垮登录
            pass
    return hit(key, limit, window)


async def aremaining(key: str, limit: int, window: int) -> int:
    r = get_redis()
    if r is not None:
        try:
            raw = await r.get(f"blog:ratelimit:{key}")
            return max(0, limit - int(raw or 0))
        except Exception:
            pass
    return remaining(key, limit, window)


async def areset(key: str) -> None:
    """清除计数（登录成功后调用，避免正常用户被历史失败拖累）。"""
    r = get_redis()
    if r is not None:
        try:
            await r.delete(f"blog:ratelimit:{key}")
        except Exception:
            pass
    reset(key)
