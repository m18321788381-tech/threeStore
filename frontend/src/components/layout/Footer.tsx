import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container-page grid gap-8 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent">
              {siteConfig.title.slice(0, 1)}
            </span>
            <span className="font-semibold">{siteConfig.title}</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            {siteConfig.description}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">导航</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-accent">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold">订阅与联系</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <a href="/feed.xml" className="hover:text-accent">
                RSS 订阅
              </a>
            </li>
            {siteConfig.social.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="hover:text-accent"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/admin" className="hover:text-accent">
                后台管理
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border py-6">
        <div className="container-page flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {siteConfig.author} · 用 Next.js 与 FastAPI 搭建
          </span>
          <span className="font-mono">按 Ctrl/⌘ + K 唤出终端</span>
        </div>
      </div>
    </footer>
  );
}
