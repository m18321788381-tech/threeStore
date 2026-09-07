"""创建/重置博主账号。

用法：
    python scripts/init_admin.py              # 不存在则创建
    python scripts/init_admin.py --reset      # 强制重置密码
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# 以 `python scripts/init_admin.py` 直跑时 sys.path[0] 是 scripts/，需把项目根（容器内 /app）加入
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402


async def main(reset: bool = False) -> None:
    async with SessionLocal() as session:
        user = (
            await session.execute(
                select(User).where(User.username == settings.ADMIN_USERNAME)
            )
        ).scalar_one_or_none()

        if user and not reset:
            print(f"博主账号已存在：{settings.ADMIN_USERNAME}（使用 --reset 重置密码）")
            return

        if user is None:
            user = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                display_name=settings.ADMIN_DISPLAY_NAME,
                role=0,
                bio="一个把写作当成正事的人。",
            )
            session.add(user)

        user.password_hash = hash_password(settings.ADMIN_PASSWORD)
        await session.commit()
        print(
            f"博主账号就绪：{settings.ADMIN_USERNAME} / {settings.ADMIN_PASSWORD}"
            "（请上线前修改 .env 中的 ADMIN_PASSWORD）"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="重置已有账号密码")
    args = parser.parse_args()
    asyncio.run(main(reset=args.reset))
