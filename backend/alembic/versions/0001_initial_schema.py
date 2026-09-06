"""initial schema: users / posts / taxonomy / media / comments / post_links

Revision ID: 0001
Revises:
Create Date: 2026-09-05
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("username", sa.String(50), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), server_default="", nullable=True),
        sa.Column("avatar", sa.String(500), server_default="", nullable=True),
        sa.Column("bio", sa.String(1000), server_default="", nullable=True),
        sa.Column("role", sa.Integer(), server_default="0", nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        sa.Column("description", sa.Text(), server_default="", nullable=True),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        *_timestamps(),
    )

    op.create_table(
        "posts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(250), nullable=False, unique=True),
        sa.Column("summary", sa.Text(), server_default="", nullable=True),
        sa.Column("content_md", sa.Text(), server_default="", nullable=True),
        sa.Column("content_html", sa.Text(), server_default="", nullable=True),
        sa.Column("toc", sa.Text(), server_default="", nullable=True),
        sa.Column("cover_url", sa.String(500), server_default="", nullable=True),
        sa.Column("status", sa.SmallInteger(), server_default="0", nullable=True),
        sa.Column("view_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("reading_time", sa.Integer(), server_default="1", nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_posts_slug", "posts", ["slug"])
    op.create_index("ix_posts_author_id", "posts", ["author_id"])
    op.create_index("ix_posts_category_id", "posts", ["category_id"])
    op.create_index("ix_posts_published_at", "posts", ["published_at"])
    op.create_index("ix_posts_status_published_at", "posts", ["status", "published_at"])

    op.create_table(
        "post_tags",
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("post_id", "tag_id"),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "media",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), server_default="", nullable=True),
        sa.Column("size", sa.Integer(), server_default="0", nullable=True),
        sa.Column("width", sa.Integer(), server_default="0", nullable=True),
        sa.Column("height", sa.Integer(), server_default="0", nullable=True),
        sa.Column("uploader_id", sa.Uuid(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["uploader_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "post_stats",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("post_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("view_count", sa.Integer(), server_default="0", nullable=True),
        sa.Column("like_count", sa.Integer(), server_default="0", nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "comments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("author_name", sa.String(50), server_default="", nullable=True),
        sa.Column("author_email", sa.String(255), server_default="", nullable=True),
        sa.Column("author_site", sa.String(255), server_default="", nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("ip_address", sa.String(45), server_default="", nullable=True),
        sa.Column("user_agent", sa.String(500), server_default="", nullable=True),
        sa.Column("status", sa.SmallInteger(), server_default="0", nullable=True),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=True),
        sa.Column("is_author", sa.Boolean(), server_default=sa.false(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["comments.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_comments_post_id", "comments", ["post_id"])
    op.create_index(
        "ix_comments_post_status_created",
        "comments",
        ["post_id", "status", "created_at"],
    )
    op.create_index("ix_comments_parent", "comments", ["parent_id"])

    op.create_table(
        "post_links",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_post_id", sa.Uuid(), nullable=False),
        sa.Column("target_post_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["source_post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_post_id"], ["posts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_post_links_source", "post_links", ["source_post_id"])
    op.create_index("ix_post_links_target", "post_links", ["target_post_id"])
    op.create_unique_constraint(
        "uq_post_links_pair", "post_links", ["source_post_id", "target_post_id"]
    )


def downgrade() -> None:
    op.drop_table("post_links")
    op.drop_table("comments")
    op.drop_table("post_stats")
    op.drop_table("media")
    op.drop_table("post_tags")
    op.drop_table("posts")
    op.drop_table("tags")
    op.drop_table("categories")
    op.drop_table("users")
