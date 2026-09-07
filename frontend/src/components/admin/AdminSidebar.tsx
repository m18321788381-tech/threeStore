"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setAuthToken } from "@/lib/api";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "仪表盘", icon: "◎", exact: true },
  { href: "/admin/posts", label: "文章", icon: "≡" },
  { href: "/admin/comments", label: "评论", icon: "❝" },
  { href: "/admin/categories", label: "分类", icon: "▤" },
  { href: "/admin/tags", label: "标签", icon: "#" },
  { href: "/admin/media", label: "媒体", icon: "▣" },
];

/** 后台侧栏：对齐设计稿 A-01 —— 弱底色栏 + 实心强调色选中态。 */
export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = () => {
    setAuthToken(null);
    router.push("/admin/login");
  };

  return (
    <aside className="w-full shrink-0 border-b border-border bg-surface lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-[220px] lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <p className="side-title hidden px-4 pb-2 pt-6 lg:block">管理后台</p>

        <nav
          className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:py-0"
          aria-label="后台导航"
        >
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-btn px-3 py-[9px] text-sm transition-colors",
                  active
                    ? "bg-accent font-semibold text-on-accent"
                    : "text-muted hover:bg-card hover:text-foreground"
                )}
              >
                <span aria-hidden className="w-4 shrink-0 text-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden flex-1 lg:block" />

        <div className="flex flex-col gap-0.5 px-3 pb-4 lg:border-t lg:border-border lg:pt-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 whitespace-nowrap rounded-btn px-3 py-[9px] text-sm text-muted transition-colors hover:bg-card hover:text-foreground"
          >
            <span aria-hidden className="w-4 shrink-0 text-center">
              ↩
            </span>
            返回站点
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-btn px-3 py-[9px] text-left text-sm text-muted transition-colors hover:bg-card hover:text-error"
          >
            <span aria-hidden className="w-4 shrink-0 text-center">
              ⏻
            </span>
            退出登录
          </button>
        </div>
      </div>
    </aside>
  );
}
