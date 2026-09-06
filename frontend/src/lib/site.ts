/** 站点级配置：优先读环境变量，缺省值保证本地可跑。 */
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
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
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
