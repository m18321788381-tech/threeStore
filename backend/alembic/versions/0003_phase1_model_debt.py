"""phase-1 model debt: posts 置顶与 SEO 覆盖字段 / media 元数据 / redirects 表 / 清理僵尸列

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-11

背景（详见 docs/模型与功能缺口分析_20260911.md）：
    第一期要清掉的是「模型债务」，不是加功能。四组改动：

    1. posts 补 is_pinned / canonical_url / noindex
       - is_pinned：列表页固定「置顶优先」排序，需要三列复合索引才走得动索引扫描；
         原有两列索引保留不动（归档页只按 published_at 排序，用不上三列索引）。
       - canonical_url / noindex：SEO 覆盖项。留空/关时完全走全站默认规则，
         存量数据 server_default 保证升级后行为与升级前完全一致。

    2. media 补 alt / content_hash，并让 width/height 真正有值
       - width/height 列**早已存在但从未写入**（上传时没赋值），恒为 0，
         导致前端无法输出尺寸属性、图片加载产生 CLS。本次只改写入逻辑，无 DDL。
       - content_hash = 落盘字节 sha256，用于「同图不重复落盘」与孤儿文件清理。
       - 存量行的 content_hash 为空串，属预期：无法在不读取原文件的前提下回填。

    3. 新建 redirects 表
       - 此前改 slug 会让旧链接直接 404，SEO 权重白丢且无补救路径。
       - 不挂 posts 外键：旧链接的价值恰在文章删除后依然存在，
         挂 FK 会随文章 CASCADE 一起消失。

    4. 删除 post_stats.like_count
       - 僵尸列：本站产品立场明确「没有点赞」，保留只会误导后来者。
       - ⚠️ downgrade 只能恢复列结构与默认值，**数据不可恢复**。
         该列存量值恒为 0（无任何写入点），因此不存在实际数据损失。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------------------------------------------------------------- posts ---
    # NOT NULL + server_default：与模型声明（Mapped[str] / Mapped[bool]）保持严格一致。
    # 存量行由 server_default 回填，升级后行为与升级前完全一致。
    op.add_column(
        "posts",
        sa.Column(
            "canonical_url", sa.String(500), server_default="", nullable=False
        ),
    )
    op.add_column(
        "posts",
        sa.Column(
            "noindex", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "posts",
        sa.Column(
            "is_pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    # 列表页排序索引：WHERE status = ? ORDER BY is_pinned DESC, published_at DESC
    op.create_index(
        "ix_posts_status_pinned_published",
        "posts",
        ["status", "is_pinned", "published_at"],
    )

    # ---------------------------------------------------------------- media ---
    op.add_column(
        "media",
        sa.Column("alt", sa.String(255), server_default="", nullable=False),
    )
    op.add_column(
        "media",
        sa.Column("content_hash", sa.String(64), server_default="", nullable=False),
    )
    # 去重查找按 hash 走索引；非唯一索引——历史数据可能已存在同 hash 行
    op.create_index("ix_media_content_hash", "media", ["content_hash"])

    # ------------------------------------------------------------ redirects ---
    op.create_table(
        "redirects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("old_slug", sa.String(250), nullable=False),
        sa.Column("new_slug", sa.String(250), nullable=False),
        sa.Column("hit_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    # 一个旧 slug 只能指向一个目标，唯一约束同时充当查询索引
    op.create_index("uq_redirects_old_slug", "redirects", ["old_slug"], unique=True)
    op.create_index("ix_redirects_new_slug", "redirects", ["new_slug"])

    # ----------------------------------------------------------- 僵尸列清理 ---
    op.drop_column("post_stats", "like_count")


def downgrade() -> None:
    # 恢复 like_count（⚠️ 原数据不可恢复，见模块 docstring）
    op.add_column(
        "post_stats",
        sa.Column("like_count", sa.Integer(), server_default="0", nullable=True),
    )

    op.drop_index("ix_redirects_new_slug", table_name="redirects")
    op.drop_index("uq_redirects_old_slug", table_name="redirects")
    op.drop_table("redirects")

    op.drop_index("ix_media_content_hash", table_name="media")
    op.drop_column("media", "content_hash")
    op.drop_column("media", "alt")

    op.drop_index("ix_posts_status_pinned_published", table_name="posts")
    op.drop_column("posts", "is_pinned")
    op.drop_column("posts", "noindex")
    op.drop_column("posts", "canonical_url")
