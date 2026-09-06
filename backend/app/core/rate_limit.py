"""极简内存限流（单进程足够；多副本场景可换 Redis）。"""
from __future__ import annotations

import time
from collections import defaultdict, deque

_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


def hit(key: str, limit: int, window: int) -> bool:
    """记录一次访问；返回 True 表示允许（未超限）。"""
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
