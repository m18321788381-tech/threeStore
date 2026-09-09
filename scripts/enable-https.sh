#!/usr/bin/env bash
#
# 一键启用 HTTPS（Let's Encrypt）。
#
# 用法：
#   ./scripts/enable-https.sh <域名> <邮箱> [--staging] [--hsts] [--www]
#
#   --staging   用 Let's Encrypt 测试环境签发，避免触发正式环境频率限制（建议先跑一次）
#   --hsts      同时下发 HSTS 响应头（一旦下发，max-age 期间无法撤回，稳定运行后再开）
#   --www       额外为 www.<域名> 签发证书并加入 server_name
#
# 前置条件：
#   1) 域名 A 记录已指向本机公网 IP（脚本会校验，不一致会中止）
#   2) 80 端口未被其他进程占用，且 docker compose 已能正常起服务
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOMAIN="${1:-}"
EMAIL="${2:-}"
STAGING=0
HSTS=0
WITH_WWW=0
shift $(( $# < 2 ? $# : 2 )) 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --staging) STAGING=1 ;;
    --hsts) HSTS=1 ;;
    --www) WITH_WWW=1 ;;
    *) echo "未知参数：$arg" >&2; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "用法：$0 <域名> <邮箱> [--staging] [--hsts] [--www]" >&2
  exit 1
fi

log()  { printf '\033[36m[enable-https]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[enable-https]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[enable-https]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "未找到 docker"

# ---------------------------------------------------------------- 1. 域名解析校验
log "校验 $DOMAIN 是否解析到本机公网 IP…"
DOMAIN_IP="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)"
if [[ -z "$DOMAIN_IP" ]]; then
  DOMAIN_IP="$(dig +short "$DOMAIN" A 2>/dev/null | grep -E '^[0-9]+\.' | head -1)"
fi
[[ -n "$DOMAIN_IP" ]] || die "$DOMAIN 无法解析，请先在 DNS 控制台添加 A 记录"

HOST_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 8 http://ifconfig.me 2>/dev/null || true)"
if [[ -n "$HOST_IP" && "$HOST_IP" != "$DOMAIN_IP" ]]; then
  die "域名解析到 $DOMAIN_IP，但本机公网 IP 是 $HOST_IP。请先修正 DNS 记录。"
fi
log "解析正常：$DOMAIN -> ${DOMAIN_IP}"

# ---------------------------------------------------------------- 2. 准备目录
mkdir -p nginx/certbot nginx/certs
CERT_DOMAINS="-d $DOMAIN"
if [[ "$WITH_WWW" -eq 1 ]]; then CERT_DOMAINS="$CERT_DOMAINS -d www.$DOMAIN"; fi

# ---------------------------------------------------------------- 3. 确保 HTTP 站点在线
log "确保 80 端口站点已在线（ACME 校验需要）…"
docker compose up -d nginx
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 5 "http://$DOMAIN/.well-known/acme-challenge/probe" \
     || curl -sS -o /dev/null --max-time 5 "http://$DOMAIN/"; then
    break
  fi
  sleep 2
done
curl -sS -o /dev/null --max-time 10 "http://$DOMAIN/" \
  || die "http://$DOMAIN/ 无法访问，请检查 80 端口与安全组放行"

# ---------------------------------------------------------------- 4. 签发证书
STAGING_FLAG=""
[[ "$STAGING" -eq 1 ]] && STAGING_FLAG="--staging"
if [[ "$STAGING" -eq 1 ]]; then
  warn "使用 Let's Encrypt 测试环境签发：证书不被浏览器信任，仅用于验证流程"
fi

log "向 Let's Encrypt 申请证书（webroot 方式，不中断站点）…"
docker run --rm \
  -v "$ROOT_DIR/nginx/certbot:/var/www/certbot" \
  -v "$ROOT_DIR/nginx/certs:/etc/letsencrypt" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --non-interactive --agree-tos --no-eff-email \
  -m "$EMAIL" $CERT_DOMAINS $STAGING_FLAG --keep-until-expiring

[[ -f "nginx/certs/live/$DOMAIN/fullchain.pem" ]] \
  || die "证书未生成：nginx/certs/live/$DOMAIN/fullchain.pem 不存在"

# ---------------------------------------------------------------- 5. 渲染 nginx 配置
if [[ ! -f nginx/default.conf.http.bak ]]; then
  cp nginx/default.conf nginx/default.conf.http.bak
  log "已备份原 HTTP 配置为 nginx/default.conf.http.bak"
fi

SERVER_NAME="$DOMAIN"
[[ "$WITH_WWW" -eq 1 ]] && SERVER_NAME="$DOMAIN www.$DOMAIN"

sed -e "s/{{DOMAIN}}/$SERVER_NAME/g" nginx/ssl.conf.template > nginx/default.conf
if [[ "$HSTS" -eq 1 ]]; then
  sed -i 's|^    # add_header Strict-Transport-Security|    add_header Strict-Transport-Security|' nginx/default.conf
  log "已启用 HSTS"
else
  warn "HSTS 未启用。建议 HTTPS 稳定一周后重跑本脚本并加 --hsts。"
fi
log "已生成 nginx/default.conf"

# ---------------------------------------------------------------- 6. 以 443 重启
log "重启 nginx（叠加 docker-compose.https.yml）…"
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --force-recreate nginx
sleep 5

# ---------------------------------------------------------------- 7. 验证
log "验证 HTTPS…"
HTTPS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN/" || echo 000)"
[[ "$HTTPS_CODE" == "200" ]] || die "HTTPS 返回 $HTTPS_CODE，请检查 docker compose logs nginx"

REDIRECT="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 10 "http://$DOMAIN/" || true)"
[[ "$REDIRECT" == https://* ]] || warn "HTTP 未正确跳转到 HTTPS（实际：${REDIRECT:-无}）"

log "✅ HTTPS 已生效"
cat <<EOF

接下来还需要手工完成两件事（脚本无法代劳）：

  1) 更新 .env 中的站点地址并重建前端，否则 RSS / Sitemap / OG 卡片仍会是 http：
       SITE_URL=https://$DOMAIN
       docker compose build frontend && docker compose up -d frontend

  2) 配置证书自动续期（Let's Encrypt 证书只有 90 天）：
       (crontab -l 2>/dev/null; echo "17 3 * * * cd $ROOT_DIR && ./scripts/renew-certs.sh >> /var/log/blog-certbot.log 2>&1") | crontab -

EOF
