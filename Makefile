# 个人博客 · 一键命令
# 说明：compose 默认使用 docker-compose.yml，开发用 docker-compose.dev.yml

ENV?=.env
COMPOSE=docker compose
DEV_COMPOSE=docker compose -f docker-compose.dev.yml

.PHONY: help up down dev db-migrate init-admin seed logs build clean

help: ## 查看可用命令
	@echo "可用命令："
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## 生产编排：构建并启动全部服务
	$(COMPOSE) --env-file $(ENV) up -d --build

down: ## 停止并移除容器（保留数据卷）
	$(COMPOSE) --env-file $(ENV) down

dev: ## 开发编排：仅启动 db + 后端（前端在宿主机 npm run dev）
	$(DEV_COMPOSE) --env-file $(ENV) up -d --build

db-migrate: ## 后端容器内执行数据库迁移（alembic upgrade head）
	$(COMPOSE) --env-file $(ENV) exec backend alembic upgrade head

init-admin: ## 初始化 / 重置管理员账号
	$(COMPOSE) --env-file $(ENV) exec backend python scripts/init_admin.py

seed: ## 灌入示例文章 / 标签 / 评论
	$(COMPOSE) --env-file $(ENV) exec backend python scripts/seed.py

logs: ## 查看全部服务日志
	$(COMPOSE) --env-file $(ENV) logs -f

build: ## 仅构建镜像不启动
	$(COMPOSE) --env-file $(ENV) build

clean: ## 停止并删除容器 + 数据卷（危险，会清空数据）
	$(COMPOSE) --env-file $(ENV) down -v
