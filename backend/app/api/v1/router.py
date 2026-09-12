from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    comments,
    links,
    media,
    meta,
    posts,
    redirects,
    search,
    stats,
    taxonomy,
)

api_router = APIRouter()
api_router.include_router(meta.router)
api_router.include_router(auth.router)
api_router.include_router(posts.router)
# /posts/{slug}/comments 与 /posts/{slug}/links 必须挂在 posts.router 之后注册，
# 路径多一段不会与 /posts/{slug} 冲突。
api_router.include_router(comments.post_comments_router)
api_router.include_router(comments.router)
api_router.include_router(taxonomy.categories_router)
api_router.include_router(taxonomy.tags_router)
api_router.include_router(media.router)
api_router.include_router(search.router)
api_router.include_router(stats.router)
api_router.include_router(links.post_links_router)
api_router.include_router(links.garden_router)
# 独立前缀 /redirects，与 /posts/{slug} 无任何路径重叠，不存在注册顺序问题
api_router.include_router(redirects.router)

__all__ = ["api_router"]
