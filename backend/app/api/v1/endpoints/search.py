"""全文搜索：中文友好分词 + 相关度排序 + 命中片段高亮。

相比改造前的实现（单条 ILIKE 三字段 OR、按时间排序），这里解决三个真实问题：
    1. 中文搜不到：整句关键词被当成一个 LIKE 模式，只要正文字面不同就零结果；
    2. 结果不排序：命中标题和命中正文一个权重，最相关的文章可能排在第 5 页；
    3. 无法判断为什么命中：只显示摘要，正文中命中的地方看不到。

实现要点见 app/services/search.py 的说明。索引侧依赖 pg_trgm（0002 迁移创建），
用于把 ILIKE 全表扫描变成 GIN 索引扫描，并提供 similarity() 作为排序加分项。
索引不可用时会自动降级为纯 ILIKE，不影响正确性。
"""
from __future__ import annotations

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fastapi import APIRouter, Depends, Query

from app.api.deps import Pagination, pagination_params
from app.core.enums import PostStatus
from app.db.session import get_db
from app.models.post import Post
from app.schemas import ok, paginate
from app.services.search import build_snippet, tokenize
from app.services.serializers import post_list_item

router = APIRouter(tags=["search"])

# 三态缓存：None=未探测 / True=pg_trgm 可用 / False=不可用。
# 探测一次即可，避免每个请求都试错。
_TRGM_AVAILABLE: bool | None = None


def _match_clause(terms: list[str], mode: str):
    """构造匹配条件：mode=all 为 AND（精确），mode=any 为 OR（宽松）。"""
    per_term = []
    for term in terms:
        like = f"%{term}%"
        per_term.append(
            or_(
                Post.title.ilike(like),
                Post.summary.ilike(like),
                Post.content_md.ilike(like),
            )
        )
    return and_(*per_term) if mode == "all" else or_(*per_term)


def _score_expression(terms: list[str], keyword: str, use_trgm: bool):
    """相关度表达式：标题 >> 摘要 > 正文，整句命中额外加分。"""
    score = case((Post.title.ilike(f"%{keyword}%"), 40), else_=0)
    for term in terms:
        like = f"%{term}%"
        score = (
            score
            + case((Post.title.ilike(like), 60), else_=0)
            + case((Post.summary.ilike(like), 20), else_=0)
            + case((Post.content_md.ilike(like), 10), else_=0)
        )
    if use_trgm:
        # 模糊加分：错别字/部分词也能把正确结果顶上来
        score = score + func.similarity(Post.title, keyword) * 25
    return score


async def _query(
    session: AsyncSession,
    terms: list[str],
    keyword: str,
    mode: str,
    page_params: Pagination,
    use_trgm: bool,
) -> tuple[int, list[Post]]:
    where = [Post.status == PostStatus.PUBLISHED, _match_clause(terms, mode)]
    score = _score_expression(terms, keyword, use_trgm)

    base = select(Post).options(
        selectinload(Post.tags),
        selectinload(Post.category),
        selectinload(Post.author),
    )
    order = (score.desc(), Post.published_at.desc().nulls_last())

    total = (await session.execute(select(func.count(Post.id)).where(*where))).scalar_one()
    rows = (
        (
            await session.execute(
                base.where(*where)
                .order_by(*order)
                .offset(page_params.offset)
                .limit(page_params.page_size)
            )
        )
        .scalars()
        .all()
    )
    return total, list(rows)


@router.get("/search")
async def search(
    q: str = Query("", max_length=100),
    page_params: Pagination = Depends(pagination_params),
    session: AsyncSession = Depends(get_db),
):
    # 空关键词返回空结果集而非 422：前端搜索页直接以 /search 进入时不应报错，
    # 也方便第三方调用方无条件传参。
    keyword = q.strip()
    if not keyword:
        return ok(
            {
                "keyword": "",
                **paginate([], 0, page_params.page, page_params.page_size),
            }
        )

    terms_all = tokenize(keyword)
    terms = terms_all or [keyword]
    # AND 阶段只用「主词」（不含二元组）：否则噪声二元组会让精确召回永远落空
    primary = tokenize(keyword, expand=False) or terms

    global _TRGM_AVAILABLE
    use_trgm = _TRGM_AVAILABLE is not False

    # 两阶段召回：先要求主词全部命中（最准），零结果再放宽到任一词（含二元组）命中。
    total, rows, matched_terms = 0, [], terms
    for mode, mode_terms in (("all", primary), ("any", terms)):
        try:
            total, rows = await _query(
                session, mode_terms, keyword, mode, page_params, use_trgm
            )
            if use_trgm:
                _TRGM_AVAILABLE = True
        except (ProgrammingError, DBAPIError):
            # pg_trgm 缺失（迁移未执行 / 无权限建扩展）：回滚后降级重跑
            await session.rollback()
            _TRGM_AVAILABLE = False
            use_trgm = False
            total, rows = await _query(
                session, mode_terms, keyword, mode, page_params, use_trgm
            )
        if total:
            matched_terms = mode_terms + [t for t in terms if t not in mode_terms]
            break

    items = []
    for post in rows:
        item = post_list_item(post)
        item["highlight"] = build_snippet(
            post.content_md or "", matched_terms, summary=post.summary or ""
        )
        items.append(item)

    return ok(
        {
            "keyword": keyword,
            **paginate(items, total, page_params.page, page_params.page_size),
        }
    )


__all__ = ["router"]
