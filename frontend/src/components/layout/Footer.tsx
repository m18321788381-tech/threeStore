import Link from "next/link";
import { brandParts, siteConfig } from "@/lib/site";

/** 页脚：对齐设计稿 V-01 .footer —— 单行紧凑，不占据阅读视线。 */
export function Footer() {
  const brand = brandParts();
  const links = [
    { href: "/feed.xml", label: "RSS" },
    { href: "/sitemap.xml", label: "Sitemap" },
    ...siteConfig.social,
    { href: "/admin", label: "后台管理" },
  ];

  return (
    <footer className="border-t border-border">
      <div className="container-page flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link href="/" className="font-bold tracking-tight">
            {brand.prefix}
            {brand.suffix && <span className="text-accent">{brand.suffix}</span>}
          </Link>
          <span className="text-muted" aria-hidden>
            ·
          </span>
          <span className="text-muted">写作、阅读与知识网络</span>
        </div>

        <nav aria-label="页脚链接" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target={item.href.startsWith("http") ? "_blank" : undefined}
              rel={item.href.startsWith("http") ? "noreferrer" : undefined}
              className="text-muted transition-colors hover:text-accent"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="border-t border-border py-5">
        <div className="container-page flex flex-col gap-1.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {siteConfig.author} · 用 Next.js 与 FastAPI 搭建
          </span>
          <span className="font-mono">按 Ctrl/⌘ + K 唤出终端</span>
        </div>
      </div>
    </footer>
  );
}
