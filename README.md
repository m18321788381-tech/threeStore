# 三石笔记 · 个人博客

一个内容驱动的个人技术博客。基于 **Next.js 15（App Router）+ FastAPI + PostgreSQL** 的全栈实现，覆盖设计文档（v3.0）的 P0–P4 全部分期，并包含三项特色功能：**动态 OG 分享卡片、数字花园（双向链接）、Ctrl/⌘+K 终端彩蛋**。

---

## 功能清单

### 阅读端（用户可见）
- **文章列表**：首页信息流、分类页、标签页、归档页、搜索页，支持分页与多种排序。
- **文章详情**：服务端渲染（SSR），Markdown 由后端预渲染为安全 HTML（markdown-it-py + Pygments + bleach 清洗），前端用 `react-markdown` 兜底；含目录 TOC（滚动高亮）、阅读时长、上一篇/下一篇、浏览量统计。
- **标签 / 分类**：独立的分类页与标签页，带文章计数与筛选。
- **关于页**：站点简介、RSS、社交链接。
- **评论**：游客可评论，管理员后台审核（通过/驳回/置顶/删除）。
- **RSS / Sitemap**：后端动态生成 `/feed.xml` 与 `/sitemap.xml`。
- **深色模式**：`next-themes`，整站主题切换。

### 三项特色功能（全部实现）
1. **动态 OG 分享卡片**：`/og?title=...&desc=...&v=stamp` 用 `next/og` 实时生成 1200×630 图片，文章详情页 `og:image` 自动指向它，分享到社交平台即可拿到预览图。
2. **数字花园（双向链接）**：正文用 `[[文章标题]]` 语法书写；后端解析并落库 `post_links`，详情页展示「出链 / 反向链接」，独立页面 `/garden` 用 d3-force 渲染力导向关系图谱（可缩放、拖拽、点选跳转）。
3. **Ctrl/⌘+K 终端彩蛋**：全局快捷键唤起仿终端面板，支持 `help / ls / cd / cat / open / theme / whoami / date / uname / sudo / clear / exit` 等命令，首次访问有提示气泡。

### 博主后台
- 登录鉴权（JWT，access + refresh），路由级 `AuthGuard`。
- 仪表盘概览、文章管理（增删改、发布/草稿、Markdown 编辑器含 `[[链接]]` 高亮与未解析检测）、分类/标签管理、评论审核、媒体上传（MIME 白名单 + 魔数校验）。

---

## 技术架构

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  Nginx     │────▶│  Frontend  │     │  Backend   │
│ (80/443)   │     │ Next.js 15 │────▶│ FastAPI    │────▶ PostgreSQL 16
└────────────┘     └────────────┘     └────────────┘
     │                  │                   │
  静态/TLS           SSR/SSG/ISR         Markdown 渲染 · 鉴权 · 管理
```

- **渲染模式（设计文档 §5.4 模式 A）**：Server Component 在服务端直接用内网地址（`http://backend:8000`）访问后端；浏览器侧请求走同源 `/api`（由 Next 反代），无需跨域。
- **Markdown 管线**：`content_md` 为唯一真源，保存时渲染为 `content_html` 并缓存；`[[链接]]` 先做占位替换，渲染后回填，避免被清洗器误删。
- **数据库**：SQLAlchemy 2.0 异步 + Alembic 迁移；PostgreSQL 16。

---

## 目录结构

```
boke/
├── backend/                 # FastAPI 服务
│   ├── app/
│   │   ├── core/            # config / security / rate_limit / enums
│   │   ├── models/          # SQLAlchemy 模型
│   │   ├── services/        # markdown / slug / links / comments / feed
│   │   ├── schemas/         # Pydantic 入参出参
│   │   ├── api/v1/endpoints/# 路由
│   │   └── main.py          # 应用装配
│   ├── alembic/             # 迁移脚本
│   ├── scripts/             # init_admin.py / seed.py
│   ├── Dockerfile / Dockerfile.dev
│   └── requirements.txt
├── frontend/                # Next.js 15 应用
│   ├── src/app/             # 路由（首页/文章/分类/标签/归档/搜索/关于/花园/后台）
│   ├── src/components/      # layout / post / comment / garden / egg / admin / editor
│   ├── src/lib/             # api / utils / site
│   ├── src/styles/          # globals.css / pygments.css
│   └── Dockerfile
├── nginx/                   # default.conf / ssl.conf.template / Dockerfile
├── scripts/                 # backup / restore / enable-https / renew-certs
├── docker-compose.yml       # 生产编排（nginx+frontend+backend+db）
├── docker-compose.https.yml # HTTPS 叠加层（443 端口，配合 enable-https.sh 使用）
├── docker-compose.dev.yml   # 开发编排（db+backend 热重载）
├── Makefile
└── .env.example
```

---

## 快速开始

### 前置
- Docker 与 Docker Compose（生产）**或** Python 3.12 + Node 22（本地开发）。
- PostgreSQL 16（本地开发时可用 Docker 单独起，或自有实例）。

### 方式一：Docker 生产编排（推荐）

> ⚠️ **安全前置（必做）**：`APP_ENV=production` 时后端会在启动前校验安全基线，
> 任一项不合规将**直接拒绝启动**：
> - `SECRET_KEY` / `JWT_SECRET` 必须是 `openssl rand -hex 32` 生成的高熵值，且互不相同
> - `ADMIN_PASSWORD` 必须 ≥ 12 位强口令（默认 `admin12345` 会被拒绝）
> - `SITE_URL` 必须是真实访问地址（`localhost` 会让 RSS / Sitemap / OG 全部失效）
>
> 该校验源自一次真实事故：默认口令与默认 JWT 密钥直接上生产，导致后台可被任意接管。

```bash
cp .env.example .env          # 按部署环境修改密钥与站点信息
openssl rand -hex 32          # 生成 SECRET_KEY（再跑一次生成不同的 JWT_SECRET）
docker compose up -d --build  # 构建并启动 4 个服务
```

> 国内云主机上构建慢多半是拉官方源：`.env` 已预置 `APT_MIRROR_HOST` / `APK_MIRROR_HOST` / `PIP_INDEX_URL` / `NPM_REGISTRY`
> 指向 `mirrors.cloud.tencent.com`，腾讯云 CVM 可改成内网源 `mirrors.tencentyun.com`。后端构建默认不再安装 gcc（依赖均有预编译 wheel）。

启动后访问 `http://localhost`（或你配置的域名）。后端容器启动时会自动 `alembic upgrade head`，无需手动迁移。

常用命令（见 Makefile）：

```bash
make up        # 构建并启动
make down      # 停止（保留数据卷）
make logs      # 看日志
make init-admin# 初始化/重置管理员
make seed      # 灌入示例数据
make clean     # 停止并清空数据（危险）
```

### 方式二：本地开发

```bash
# 1) 后端（数据库用 Docker，或指向本地 PG）
docker compose -f docker-compose.dev.yml --env-file .env up -d
# 后端热重载运行于 http://localhost:8000，自动迁移

# 2) 前端（另开终端）
cd frontend
npm install
npm run dev     # http://localhost:3000
```

前端开发时连接 `http://localhost:8000`；浏览器侧 `/api`、`/media`、`/feed.xml`、`/sitemap.xml` 由 `next.config.ts` 反代到后端。

---

## 初始化管理员

设计文档要求首个管理员可引导创建。镜像启动后执行：

```bash
docker compose exec backend python scripts/init_admin.py
```

默认账号取自 `.env` 的 `ADMIN_USERNAME / ADMIN_PASSWORD`（示例值 `admin / admin12345`）。**生产务必修改**。

后台入口：`/admin/login`。

---

## 环境变量

全部从 `.env` 读取（详见 `.env.example`）。关键项：

| 变量 | 说明 | 默认 |
|---|---|---|
| `SECRET_KEY` / `JWT_SECRET` | 应用与 JWT 密钥，**生产必改且不得相同** | 占位（生产模式下留空将拒绝启动） |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | PostgreSQL 连接 | `db` / 5432 / `blog` |
| `SITE_URL/TITLE/DESCRIPTION/AUTHOR` | 站点元信息（RSS/OG/Sitemap） | 见 `.env.example` |
| `COMMENT_RATE_LIMIT` / `COMMENT_RATE_WINDOW` | 反垃圾评论阈值 | `10` 条 / `600` 秒 |
| `LOGIN_FAIL_LIMIT` / `LOGIN_FAIL_WINDOW` / `LOGIN_LOCK_SECONDS` | 登录失败次数、统计窗口、锁定时长 | `5` 次 / `900` 秒 / `900` 秒 |
| `LOGIN_FAIL_LIMIT_PER_ACCOUNT` | 同一 IP + 账号维度的失败上限 | `5` |
| `LOGIN_GLOBAL_LIMIT` / `LOGIN_GLOBAL_WINDOW` | 同一 IP 总尝试次数与其窗口 | `30` / `900` 秒 |
| `ALLOW_SVG_UPLOAD` | 是否允许上传 SVG（有存储型 XSS 风险，开启后强制净化） | `false` |
| `ADMIN_*` | 引导管理员账号 | `admin`（口令留空，生产必填） |
| `HTTP_PORT/HTTPS_PORT/POSTGRES_DATA` | 暴露端口与数据卷名 | 80 / 443 / `blog_pgdata` |
| `BACKUP_DIR` / `BACKUP_KEEP_DAYS` | 备份目录与保留天数 | `./backups` / `14` |
| `APT_MIRROR_HOST/APK_MIRROR_HOST/PIP_INDEX_URL/NPM_REGISTRY` | 构建加速镜像源 | `mirrors.cloud.tencent.com` 系列 |

---

## 特色功能使用

- **动态 OG 卡片**：访问 `/og?title=标题&desc=摘要` 预览；文章页已自动注入。
- **数字花园**：文章中写 `[[另一篇标题]]` 即建立双向链接；`/garden` 查看全局图谱。
- **终端彩蛋**：任意页按 `Ctrl/⌘ + K` 唤起，输入 `help` 查看命令。

---

## 关于设计文档「6 容器」

基础编排是 4 个核心服务（nginx + frontend + backend + db）。本仓库另提供
**`docker-compose.redis.yml` 扩展**，叠加 `redis` + `worker` 两个服务，凑齐设计文档的 6 容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.redis.yml --env-file .env up -d --build
```

### 新增的两个服务在做什么
- **redis**：持久化键值存储（AOF 落盘），用于 SEO 产物缓存与失效事件总线。
- **worker**（`scripts/worker.py`）：后台进程，周期性（每 `WORKER_REFRESH_INTERVAL` 秒）
  + 事件驱动（后端在发文/改删后通过 `blog:seo:invalidate` 频道广播）地重算
  **RSS / Sitemap** 并写回 Redis。后端 `/feed.xml`、`/sitemap.xml` 优先读缓存，未命中再按需生成。

### 降级策略（重要）
`REDIS_URL` 为空（不启用扩展）时，所有 Redis 调用**静默降级**：
后端照常按需生成 feed/sitemap，应用完全不受影响。因此 4 容器与 6 容器部署都可用，
区别仅在于 SEO 产物是否被缓存、以及是否有独立 worker 进程。

> 注：本仓库将评论限流设计为进程内内存实现；如需集群部署，可将
> `app/core/rate_limit.py` 替换为基于 Redis 的实现（参考 `app/core/cache.py` 的客户端）。

---

## 相关文档

- [`docs/架构设计文档.md`](docs/架构设计文档.md)：已实现的技术架构、模块职责与关键设计决策。
- [`docs/云服务器部署文档.md`](docs/云服务器部署文档.md)：云服务器（Docker Compose）部署、HTTPS、备份与运维步骤。

## 校验状态

- 后端：`app.main` 导入干净，**47 条路由**全部注册；`requirements.txt` 依赖可安装。
- 测试：`backend/tests/` 共 **16 条安全回归用例全部通过**（`make test`），覆盖默认凭据拦截、
  限流计数、SVG 净化、polyglot 图片拦截。
- 前端：`tsc --noEmit` 通过；`next build` 已可产出 standalone 产物。
- CI：`.github/workflows/ci.yml` 在 PR 阶段执行后端 ruff + 导入冒烟 + 测试、前端 typecheck + build。
- 安全：生产环境安全基线 fail-fast 已生效（实测可拦截默认密钥 / 弱口令 / localhost SITE_URL）。
- 未验证项：本机无 Docker，容器化端到端（迁移、登录、发文、评论、OG、花园图谱）仍需在服务器验证。

## 常用命令

```bash
make up        # 构建并启动
make down      # 停止（保留数据卷）
make logs      # 看日志
make init-admin# 初始化/重置管理员
make seed      # 灌入示例数据（生产环境需二次确认）
make backup    # 备份数据库与媒体文件
make restore f=backups/blog_xxx.sql.gz  # 恢复（供演练）
make test      # 运行后端安全回归测试
make verify    # 上线前自检：类型检查 + 测试
make clean     # 停止并清空数据（危险）
```

## 后续建议

1. **配置 HTTPS**：
   ```bash
   ./scripts/enable-https.sh blog.example.com you@example.com --staging --www  # 先演练
   ./scripts/enable-https.sh blog.example.com you@example.com --www            # 再签正式
   ```
   脚本会自动签发证书、渲染 `nginx/default.conf` 并叠加 `docker-compose.https.yml`
   暴露 443；HSTS 默认不开，稳定运行后用 `--hsts` 重跑一次即可。
   启用后记得把 `.env` 的 `SITE_URL` 改成 `https://…` 并重建前端，
   并用 `scripts/renew-certs.sh` 配一条 crontab 做自动续期。
   （cookie 的 `; secure` 已按协议自动判断，无需再改代码。）
2. 在服务器上跑通端到端回归：迁移、登录、发文、评论、OG、花园图谱。
3. 启用 Redis（`docker-compose.redis.yml`）：未配置时限流降级为内存实现，
   多副本部署会导致登录锁定与评论限流各副本各算各的。
4. 接入对象存储（S3/OSS）替换本地 media 卷，便于横向扩展。
5. 配置 `crontab` 周期执行 `make backup`，并**定期做恢复演练**验证备份可用。
