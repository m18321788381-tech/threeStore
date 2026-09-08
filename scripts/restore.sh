#!/usr/bin/env bash
# =============================================================================
# 从备份恢复数据库（供恢复演练使用）
#
# 用法：./scripts/restore.sh backups/blog_20260908_030000.sql.gz
#
# ⚠️ 该操作会覆盖当前数据库。生产环境请先确认已备份当前数据。
# =============================================================================
set -euo pipefail

BACKUP_FILE="${1:-}"
COMPOSE="${COMPOSE:-docker compose}"
ENV_FILE="${ENV:-.env}"

if [ -z "$BACKUP_FILE" ]; then
  echo "用法：$0 <备份文件.sql.gz>"
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ 备份文件不存在：$BACKUP_FILE"
  exit 1
fi

log() { echo "[$(date '+%F %T')] $*"; }

log "校验备份文件…"
gzip -t "$BACKUP_FILE" || { echo "❌ 备份文件损坏"; exit 1; }

read -r -p "即将用 $BACKUP_FILE 覆盖数据库 ${DB_NAME:-blog}，确认继续？[y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  log "已取消"
  exit 0
fi

log "开始恢复…"
gunzip -c "$BACKUP_FILE" | $COMPOSE --env-file "$ENV_FILE" exec -T db psql \
  -U "${DB_USER:-blog}" -d "${DB_NAME:-blog}" -v ON_ERROR_STOP=1

log "✅ 恢复完成。建议执行 make db-migrate 确认迁移版本一致。"
