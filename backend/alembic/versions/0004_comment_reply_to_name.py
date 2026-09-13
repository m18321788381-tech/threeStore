"""comments 补 reply_to_name：让「回复 @某某」有据可查

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-13

背景（详见 docs/功能缺失与优化点清单_20260913.md 的 BUG-09）：

    楼中楼回复此前只存 parent_id，**不存被回复者是谁**，后果有两个：
    ① 前端无法展示「回复 @某某」——深度 ≥2 的缩进场景下，读者看不出这条在回复谁；
    ② 将来做「回复通知」时不知道该发给谁（要额外 join 父评论才能得到昵称）。

    因此补一列 reply_to_name，由服务端在创建评论时从父评论的 author_name 推导写入，
    **不接受客户端传值**——否则任何人都能伪造「某某回复了你」。

关于「为什么不顺便把通知字段一起加」：

    模型与功能缺口分析曾建议「一次把表设计到位」，但本站当前**没有任何发信能力**
    （无 SMTP 配置、无 Subscriber / EmailLog 表）。此时若加 notify_on_reply，
    前端就会有一个「回复时邮件通知我」的勾选框，而系统永远不会发信——
    这比没有该字段更糟：它是对读者的空承诺。

    故本轮只加**当前就有写入方与读取方**的列。notify_on_reply / email_verified /
    unsubscribe_token 等到通知功能真正落地时，随其一起迁移。
    （邮箱本身不需要迁移：comments.author_email 列早已存在，此前缺的只是前端采集入口。）

升级影响：纯增列，NOT NULL + server_default=''，存量行回填为空串，
行为与升级前完全一致（父评论为空时 reply_to_name 本就该是空）。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "comments",
        sa.Column(
            "reply_to_name",
            sa.String(50),
            server_default="",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("comments", "reply_to_name")
