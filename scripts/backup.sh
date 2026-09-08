#!/usr/bin/env bash
# =============================================================================
# 数据库 + 媒体文件备份
#
# 用法：
#   ./scripts/backup.sh              # 备份到 ./backups
#   BACKUP_DIR=/data/backup ./scripts/backup.sh
#   BACKUP_KEEP_DAYS=30 ./scripts/backup.sh
#
# 建议配合 crontab 每日执行（凌晨 3 点）：
#   0 3 * * * cd /path/to/boke && ./scripts/backup.sh >> /var/log/boke-backup.log 2>&1
#
# 注意：备份未验证等于没有备份。请定期执行恢复演练：
#   ./scripts/restore.sh backups/blog_YYYYmmdd_HHMMSS.sql.gz
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
COMPOSE="${COMPOSE:-docker compose}"
ENV_FILE="${ENV:-.env}"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%F %T')] $*"; }

# ---------- 1) 数据库 ----------
log "开始备份 PostgreSQL …"
if $COMPOSE --env-file "$ENV_FILE" exec -T db pg_dump \
      -U "${DB_USER:-blog}" -d "${DB_NAME:-blog}" --no-owner --no-acl \
   | gzip > "$BACKUP_DIR/blog_${TIMESTAMP}.sql.gz"; then
  SIZE=$(du -h "$BACKUP_DIR/blog_${TIMESTAMP}.sql.gz" | cut -f1)
  log "数据库备份完成：blog_${TIMESTAMP}.sql.gz ($SIZE)"
else
  log "❌ 数据库备份失败"
  exit 1
fi

# ---------- 2) 媒体文件 ----------
# media 卷同时挂载给 backend(/app/media) 与 nginx(/var/www/media)
MEDIA_CONTAINER="${MEDIA_CONTAINER:-backend}"
MEDIA_PATH="${MEDIA_PATH:-/app/media}"
if $COMPOSE --env-file "$ENV_FILE" exec -T "$MEDIA_CONTAINER" sh -c \
     "test -d $MEDIA_PATH && tar czf - -C $MEDIA_PATH . " \
     > "$BACKUP_DIR/media_${TIMESTAMP}.tar.gz" 2>/dev/null; then
  MSIZE=$(du -h "$BACKUP_DIR/media_${TIMESTAMP}.tar.gz" | cut -f1)
  log "媒体备份完成：media_${TIMESTAMP}.tar.gz ($MSIZE)"
else
  log "⚠️  媒体目录为空或不可用，跳过"
  rm -f "$BACKUP_DIR/media_${TIMESTAMP}.tar.gz"
fi

# ---------- 3) 清理过期备份 ----------
DELETED=$(find "$BACKUP_DIR" -name "blog_*.sql.gz" -type f -mtime +"$KEEP_DAYS" -print -delete | wc -l)
find "$BACKUP_DIR" -name "media_*.tar.gz" -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
log "已清理 $DELETED 个超过 ${KEEP_DAYS} 天的过期备份"

# ---------- 4) 校验 ----------
# 至少确认归档可读，避免"备份成功但文件损坏"的假象
if gzip -t "$BACKUP_DIR/blog_${TIMESTAMP}.sql.gz" 2>/dev/null; then
  log "✅ 备份完整性校验通过"
else
  log "❌ 备份文件损坏"
  exit 1
fi

log "备份目录：$BACKUP_DIR"
ls -lh "$BACKUP_DIR" | tail -n 5
