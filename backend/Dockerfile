# syntax=docker/dockerfile:1
# ---------- builder：只负责装依赖 ----------
# 构建加速：国内云主机直连 deb.debian.org / pypi.org 常只有几十 KB/s，构建会长时间「卡住」。
#   APT_MIRROR_HOST  apt 源主机名（腾讯云 CVM 可换 mirrors.tencentyun.com 走内网免流量）
#   APT_BUILD_DEPS   本阶段安装的系统包，默认留空（依赖都有 cp312 预编译 wheel，无需编译器）
#   PIP_INDEX_URL    pip 索引地址
# 若某依赖确实需要源码编译：docker compose build --build-arg "APT_BUILD_DEPS=build-essential libpq-dev" backend
FROM python:3.12-slim AS builder

ARG APT_MIRROR_HOST=mirrors.cloud.tencent.com
ARG APT_BUILD_DEPS=
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL}

RUN set -eux; \
    if [ -n "$APT_BUILD_DEPS" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR_HOST|g; s|security.debian.org|$APT_MIRROR_HOST|g" \
            /etc/apt/sources.list /etc/apt/sources.list.d/* || true; \
        apt-get update; \
        apt-get install -y --no-install-recommends $APT_BUILD_DEPS; \
        rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /build
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

# ---------- runtime：精简镜像 + 非 root ----------
FROM python:3.12-slim AS runtime

ARG APT_MIRROR_HOST=mirrors.cloud.tencent.com
ARG APT_RUNTIME_DEPS=libpq5 curl

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# curl 供 compose 健康检查使用；如需极简镜像可 --build-arg "APT_RUNTIME_DEPS=curl"
RUN set -eux; \
    sed -i "s|deb.debian.org|$APT_MIRROR_HOST|g; s|security.debian.org|$APT_MIRROR_HOST|g" \
        /etc/apt/sources.list /etc/apt/sources.list.d/* || true; \
    apt-get update; \
    apt-get install -y --no-install-recommends $APT_RUNTIME_DEPS; \
    rm -rf /var/lib/apt/lists/*; \
    useradd --create-home --uid 1000 app

WORKDIR /app
COPY --from=builder /install /usr/local
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app app ./app
COPY --chown=app:app scripts ./scripts

RUN mkdir -p /app/media && chown -R app:app /app
VOLUME ["/app/media"]

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:8000/health || exit 1

# 启动：先执行迁移（幂等），再用 gunicorn 管理 uvicorn worker
CMD ["sh", "-c", "alembic upgrade head && exec gunicorn app.main:app \
     --worker-class uvicorn.workers.UvicornWorker \
     --bind 0.0.0.0:8000 --workers 2 --timeout 60"]
