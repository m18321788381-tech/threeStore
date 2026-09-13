"""users 补 token_version：让「改密码」能真正把旧令牌踢下线

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-13

背景：

    JWT 是自包含凭证，签发之后服务端**没有任何手段单独作废它**。本项目此前没有
    logout 也没有改密码端点，所以这个缺口一直没被触发；但它的后果是明确的：

      - 改密码之后，攻击者手里那枚旧 access token 仍能继续用到自然过期
        （最长 settings.ACCESS_TOKEN_EXPIRE 分钟）；
      - 旧 refresh token 更严重 —— `/auth/refresh` 只检查「用户存在且启用」，
        于是它可以**无限续期**，改密码等于什么也没做。

    本迁移加一列 token_version：JWT 里带上签发时的代次，鉴权时与库里的值比对，
    不等即视为已吊销。改密码时把该值 +1，即可一次性作废该用户**全部已签发令牌**。

为什么是「整用户吊销」而不是「单令牌吊销」：

    单枚令牌级吊销需要引入 denylist（Redis 存 jti）或服务端会话表，并配套清理与
    可用性设计（Redis 掉了怎么办）。本站是单作者个人博客，需要处理的真实场景只有
    「密码泄露 / 设备丢失后改密码」——把全部设备踢下线正是期望行为，
    而重新登录的成本对作者本人约等于零。用一列整数换取这个能力，是划算的一侧。

为什么默认值是 0 而不是 1：

    升级上线那一刻，线上已有未过期的 token 里**没有 ver 声明**。读取端把缺失的
    声明按 0 处理，与存量行回填的 0 相等，因此升级不会把所有在线会话静默踢掉；
    而一旦改密码把值推到 1，所有老 token（含无声明者）立即失效。
    这是刻意的平滑：安全能力上线不该以「全体重新登录」为代价。

升级影响：纯增列，NOT NULL + server_default='0'，存量行回填为 0，
行为与升级前完全一致（0 == 缺省，鉴权结果不变）。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer,
            server_default="0",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
