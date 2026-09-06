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

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = () => {
    setAuthToken(null);
    router.push("/admin/login");
  };

  return (
    <aside className="w-full shrink-0 border-r border-border lg:h-[calc(100vh-4rem)] lg:w-56 lg:sticky lg:top-16">
      <nav className="flex gap-1 overflow-x-auto py-2 lg:flex-col lg:gap-0.5 lg:py-6">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground"
              )}
            >
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={logout}
          className="mt-2 flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground lg:mt-auto"
        >
          <span aria-hidden className="w-4 text-center">
            ⏻
          </span>
          退出登录
        </button>
      </nav>
    </aside>
  );
}
