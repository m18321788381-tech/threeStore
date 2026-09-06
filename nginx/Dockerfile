FROM nginx:1.27-alpine

# 创建证书校验目录，并准备媒体目录
RUN mkdir -p /var/www/certbot /usr/share/nginx/html/media

COPY default.conf /etc/nginx/conf.d/default.conf

# Nginx 官方镜像自带 80/443 健康检查脚本所需的最小工具
RUN apk add --no-cache curl

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://localhost/ -o /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
