import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 容器化：输出 standalone 产物，运行时镜像只拷贝 .next/standalone
  output: "standalone",
  poweredByHeader: false,
  eslint: {
    // Docker 构建阶段不因 lint 中断（CI 单独跑 lint）
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const api = process.env.INTERNAL_API_URL || "http://backend:8000";
    return [
      // 浏览器侧的 /api 请求由 Next 服务端转发到后端容器（同源，无需 CORS）
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*", destination: `${api}/media/:path*` },
      { source: "/feed.xml", destination: `${api}/feed.xml` },
      { source: "/sitemap.xml", destination: `${api}/sitemap.xml` },
    ];
  },
};

export default nextConfig;
