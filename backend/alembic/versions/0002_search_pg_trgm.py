"""search: pg_trgm 扩展 + 正文/标题 GIN 索引（中文全文检索）

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-09

为什么需要它：
    ILIKE '%关键词%' 天然无法使用 B-tree 索引，文章一多就是全表扫描。
    pg_trgm 把文本切成三元组建 GIN 索引后，LIKE / ILIKE / % 都能走索引扫描，
    这是「不引入 Meilisearch 等外部服务」前提下最划算的中文检索加速手段。

关于中文：
    pg_trgm 的三元组是按字符切的，天然对无空格语言友好——
    它不依赖分词器，所以中文不需要额外插件即可生效（这与 tsvector 不同）。
    代价是两字词（如「容器」）抽不出三元组，仍会退化为顺序扫描，可接受。
"""
from __future__ import annotations

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL 13+ 把 pg_trgm 标记为 trusted，数据库 owner 即可创建，
    # 无需 superuser；IF NOT EXISTS 保证重复执行/幂等。
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN + gin_trgm_ops 才能被 ILIKE 使用；concurrently 在事务内不可用，
    # 这里用普通方式（alembic 默认跑在事务里，迁移期间表会被短暂锁写，
    # 个人博客量级下耗时可忽略）。
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_posts_title_trgm "
        "ON posts USING gin (title gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_posts_summary_trgm "
        "ON posts USING gin (summary gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_posts_content_md_trgm "
        "ON posts USING gin (content_md gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_posts_content_md_trgm")
    op.execute("DROP INDEX IF EXISTS ix_posts_summary_trgm")
    op.execute("DROP INDEX IF EXISTS ix_posts_title_trgm")
    # 扩展不删除：其他表/功能可能已依赖，且 DROP EXTENSION 风险高于收益
