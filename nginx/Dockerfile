FROM nginx:1.27-alpine

# apk 源主机名，国内云主机建议用镜像站（留空则回退官方源），如腾讯云内网 mirrors.tencentyun.com
ARG APK_MIRROR_HOST=mirrors.cloud.tencent.com

# 创建证书校验目录，并准备媒体目录
RUN mkdir -p /var/www/certbot /usr/share/nginx/html/media

COPY default.conf /etc/nginx/conf.d/default.conf

# 健康检查需要 curl（官方 alpine 镜像默认不带）
RUN if [ -n "$APK_MIRROR_HOST" ]; then \
        sed -i "s|dl-cdn.alpinelinux.org|$APK_MIRROR_HOST|g" /etc/apk/repositories; \
    fi \
    && apk add --no-cache curl

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://localhost/ -o /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
