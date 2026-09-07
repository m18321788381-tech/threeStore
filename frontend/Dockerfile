# syntax=docker/dockerfile:1
# ---------- deps + build ----------
FROM node:22-alpine AS builder

WORKDIR /app
# 在依赖安装阶段先用 --ignore-engines 宽容锁版本，避免阻塞
COPY package.json package-lock.json* ./
# npm 源，国内云主机用镜像站可显著提速；显式传空值即回退官方源
ARG NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/
RUN npm install --no-audit --no-fund --registry="${NPM_REGISTRY:-https://registry.npmjs.org}"
COPY . .
# 构建期注入内网后端地址（Next 服务端转发用），浏览器同源仍走 /api
ARG INTERNAL_API_URL=http://backend:8000
# NEXT_PUBLIC_* 会被内联进浏览器产物，必须在构建期给值
ARG NEXT_PUBLIC_SITE_URL=http://localhost
ENV INTERNAL_API_URL=$INTERNAL_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

# ---------- runtime：standalone ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    INTERNAL_API_URL=http://backend:8000 \
    NEXT_PUBLIC_SITE_URL=http://localhost

# Next standalone 产物已经自带 node_modules 子集，无需再 npm install
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
# standalone 入口默认 server.js
CMD ["node", "server.js"]
