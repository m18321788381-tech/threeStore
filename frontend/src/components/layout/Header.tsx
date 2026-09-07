"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { brandParts, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "./ThemeSwitcher";

/** 34x34 描边图标按钮，对齐设计稿 .icon-btn */
export const iconBtnClass =
  "grid h-[34px] w-[34px] place-items-center rounded-btn border border-border text-muted transition-colors hover:border-accent hover:text-accent";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const brand = brandParts();

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
        <Link href="/" className="shrink-0 text-[19px] font-extrabold tracking-tight">
          {brand.prefix}
          {brand.suffix && <span className="text-accent">{brand.suffix}</span>}
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="主导航">
          {siteConfig.nav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-btn px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/search" aria-label="搜索" className={iconBtnClass}>
            <span aria-hidden>⌕</span>
          </Link>
          <ThemeSwitcher />
          <Link href="/admin" className="btn-ghost btn-sm ml-1 hidden md:inline-flex">
            后台
          </Link>
          <button
            type="button"
            aria-label="菜单"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(iconBtnClass, "md:hidden")}
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-border bg-background md:hidden" aria-label="移动导航">
          <div className="container-page grid gap-1 py-3">
            {siteConfig.nav.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-btn px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-accent-soft hover:text-accent"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/admin"
              className="rounded-btn px-3 py-2 text-sm text-muted hover:bg-accent-soft hover:text-accent"
            >
              后台
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
