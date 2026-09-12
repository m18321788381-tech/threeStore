"""slug 变更历史：写入 301 映射，并把旧路径解析回当前路径。

设计要点（对应 docs/模型与功能缺口分析_20260911.md 第三节 #5）：
  改 slug 之前，旧链接会直接 404 —— 外链、搜索引擎已收录的 URL、
  甚至读者收藏的地址都会失效，且没有任何补救路径。这里只做两件事：
  变更时记一笔，命中时给回新地址；**不**在每次读取时都查表。
"""
from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.redirect import Redirect


async def record_slug_change(
    session: AsyncSession, old_slug: str, new_slug: str
) -> None:
    """记录 old_slug → new_slug，并把历史记录**扁平化**。

    三步顺序不能颠倒：

    1. 把「指向 old_slug」的历史记录改指 new_slug。
       否则 A→B 之后再 B→C，会形成两跳链，而解析端只查一次，第二跳就丢了。
    2. 写入 / 更新 old_slug → new_slug 本身。
    3. 清理自环（old_slug == new_slug）。
       例如 A→B 之后又改回 A：第 1 步会把 A→B 改写成 A→A，
       必须删掉，否则解析出现「自己指自己」。

    调用方负责在调用前确认 new_slug 未被其他文章占用。
    本函数只做 session 内的写操作，**不 commit** —— 交由调用方与文章更新同一事务提交。
    """
    if not old_slug or not new_slug or old_slug == new_slug:
        return

    await session.execute(
        update(Redirect).where(Redirect.new_slug == old_slug).values(new_slug=new_slug)
    )

    existing = (
        await session.execute(select(Redirect).where(Redirect.old_slug == old_slug))
    ).scalar_one_or_none()
    if existing is None:
        session.add(Redirect(old_slug=old_slug, new_slug=new_slug))
    else:
        existing.new_slug = new_slug

    await session.execute(
        delete(Redirect).where(Redirect.old_slug == Redirect.new_slug)
    )


async def resolve_slug(session: AsyncSession, slug: str) -> str | None:
    """把历史 slug 解析为当前 slug；未命中返回 None。

    命中时会累加 hit_count 并提交。**读接口产生写入是刻意取舍**：
    没有命中计数，就永远无法判断某条重定向是否还有真实流量，也就永远不敢删它。
    记录条数由「作者改过多少次 slug」决定，规模极小，写入成本可忽略。
    计数用 SQL 原子自增，而非「读出来 +1 再写回」，避免并发下丢计数。
    """
    target = (
        await session.execute(
            select(Redirect.new_slug).where(Redirect.old_slug == slug)
        )
    ).scalar_one_or_none()
    if target is None:
        return None

    await session.execute(
        update(Redirect)
        .where(Redirect.old_slug == slug)
        .values(hit_count=Redirect.hit_count + 1, last_hit_at=func.now())
    )
    await session.commit()
    return target


__all__ = ["record_slug_change", "resolve_slug"]
