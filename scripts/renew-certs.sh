#!/usr/bin/env bash
#
# 续期 Let's Encrypt 证书并让 nginx 重新加载。
#
# 典型用法：加入 crontab，每天跑一次（证书到期前 30 天内才会真正续期）
#   17 3 * * * cd /path/to/boke && ./scripts/renew-certs.sh >> /var/log/blog-certbot.log 2>&1
#
# 说明：certbot renew 只在证书临近到期时才会真正请求新证书，
# 未到期时是空操作，因此可以安全地高频执行。
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null || { echo "未找到 docker" >&2; exit 1; }
[[ -d nginx/certs/live ]] || { echo "尚未签发证书，请先运行 scripts/enable-https.sh" >&2; exit 1; }

docker run --rm \
  -v "$ROOT_DIR/nginx/certbot:/var/www/certbot" \
  -v "$ROOT_DIR/nginx/certs:/etc/letsencrypt" \
  certbot/certbot renew --webroot -w /var/www/certbot --quiet --no-random-sleep-on-renew

# 无论是否真的换了证书，都 reload 一次：开销极小，且能保证新证书一定被加载
docker compose -f docker-compose.yml -f docker-compose.https.yml exec -T nginx \
  nginx -s reload || docker compose restart nginx

echo "$(date -Is) 证书续期检查完成"
