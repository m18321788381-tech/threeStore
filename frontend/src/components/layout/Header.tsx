"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur transition-colors",
        scrolled ? "border-border shadow-sm shadow-black/5" : "border-border/50"
      )}
    >
      <div className="container-page flex h-16 items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent">
            {siteConfig.title.slice(0, 1)}
          </span>
          <span className="text-body font-semibold tracking-tight">
            {siteConfig.title}
          </span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {siteConfig.nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/search"
            aria-label="搜索"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <span aria-hidden>⌕</span>
          </Link>
          <ThemeSwitcher />
          <button
            type="button"
            aria-label="菜单"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted md:hidden"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border bg-background md:hidden">
          <div className="container-page grid gap-1 py-3">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-accent-soft hover:text-accent"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/admin"
              className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-accent-soft hover:text-accent"
            >
              后台
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
