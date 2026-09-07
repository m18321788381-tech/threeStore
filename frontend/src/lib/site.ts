/** 站点级配置：优先读环境变量，缺省值保证本地可跑。 */
const SITE_URL_FALLBACK = "http://localhost:3000";

/** 兼容 .env 里写成 blog.example.com 这种漏掉协议的地址，避免 new URL 抛 Invalid URL。 */
function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return SITE_URL_FALLBACK;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const siteConfig = {
  title: process.env.NEXT_PUBLIC_SITE_TITLE || "三石笔记",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "一个内容驱动的个人技术博客 —— 写作、阅读与知识网络",
  author: process.env.NEXT_PUBLIC_SITE_AUTHOR || "博主",
  bio:
    process.env.NEXT_PUBLIC_SITE_BIO ||
    "后端工程师。写点关于 Python、前后端工程与知识管理的笔记。",
  avatar: process.env.NEXT_PUBLIC_SITE_AVATAR || "",
  url: normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "zh-CN",
  nav: [
    { href: "/", label: "首页" },
    { href: "/archive", label: "归档" },
    { href: "/categories", label: "分类" },
    { href: "/tags", label: "标签" },
    { href: "/garden", label: "数字花园" },
    { href: "/about", label: "关于" },
  ],
  social: [
    { href: "https://github.com", label: "GitHub" },
    { href: "mailto:admin@example.com", label: "Email" },
  ],
};

export function absoluteUrl(path = "/") {
  return new URL(path, siteConfig.url).toString();
}
