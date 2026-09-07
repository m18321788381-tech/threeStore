"""后台 worker：周期性 + 事件驱动地刷新 SEO 缓存（RSS / Sitemap）到 Redis。

设计：
- 周期刷新：每 WORKER_REFRESH_INTERVAL 秒用 DB 重算 feed/sitemap 并写回 Redis。
- 事件刷新：订阅 blog:seo:invalidate 频道，后端在发文/改删后 publish，worker 立即刷新。
- 无 Redis（REDIS_URL 为空）时仅跑周期刷新（此时缓存无意义，仅作占位；建议务必配置 Redis）。

运行：python scripts/worker.py  （compose 中作为独立容器，依赖 db + redis 健康后启动）
"""
from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

# 以 `python scripts/worker.py` 直跑时 sys.path[0] 是 scripts/，需把项目根（容器内 /app）加入
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.cache import subscribe, INVALIDATE_CHANNEL  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.services.seo import refresh_seo_cache  # noqa: E402

_running = True


def _handle_stop(signum, _frame):
    global _running
    _running = False


async def periodic(interval: int) -> None:
    """每 interval 秒刷新一次；用 1s 步进以便及时响应停止信号。"""
    while _running:
        try:
            async with SessionLocal() as session:
                result = await refresh_seo_cache(session)
                print(f"[worker] seo cache refreshed: {result}", flush=True)
        except Exception as exc:  # 单轮失败不影响下一轮
            print(f"[worker] refresh error: {exc}", flush=True)
        for _ in range(interval):
            if not _running:
                break
            await asyncio.sleep(1)


async def watch_events() -> None:
    ps = await subscribe(INVALIDATE_CHANNEL)
    if not ps:
        print("[worker] redis 不可用，仅周期刷新生效", flush=True)
        return
    print(f"[worker] subscribed to {INVALIDATE_CHANNEL}", flush=True)
    while _running:
        try:
            msg = await ps.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("type") == "message":
                async with SessionLocal() as session:
                    result = await refresh_seo_cache(session)
                print(f"[worker] cache refreshed by event: {result}", flush=True)
        except Exception as exc:
            print(f"[worker] event error: {exc}", flush=True)
            await asyncio.sleep(2)


async def main() -> None:
    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT, _handle_stop)
    print(
        f"[worker] started (interval={settings.WORKER_REFRESH_INTERVAL}s, "
        f"redis={'on' if settings.REDIS_URL else 'off'})",
        flush=True,
    )
    await asyncio.gather(periodic(settings.WORKER_REFRESH_INTERVAL), watch_events())
    print("[worker] stopped", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
