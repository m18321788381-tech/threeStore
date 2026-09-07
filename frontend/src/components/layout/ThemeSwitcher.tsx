"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/* 预设三套主题，与 globals.css 中的 .light / .sepia / .dark 一一对应 */
const THEMES = [
  { value: "light", label: "清朗", desc: "冷灰白 · 日间与代码阅读", icon: "☀", meta: "#ffffff" },
  { value: "sepia", label: "纸墨", desc: "暖米色 · 长时间阅读护眼", icon: "❖", meta: "#faf6ec" },
  { value: "dark", label: "夜读", desc: "低亮深蓝 · 夜间不刺眼", icon: "☾", meta: "#0e141f" },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setMounted(true), []);

  const current = THEMES.find((item) => item.value === resolvedTheme) ?? THEMES[0];
  const activeIndex = THEMES.findIndex((item) => item.value === current.value);

  /* 浏览器界面配色跟随主题，避免移动端状态栏闪白 */
  useEffect(() => {
    if (!mounted) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", current.meta);
  }, [mounted, current]);

  /* 点击面板外部关闭 */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  /* 打开后把焦点移到当前项，菜单内可直接用方向键选择 */
  useEffect(() => {
    if (!open) return;
    const target = itemRefs.current[activeIndex] ?? itemRefs.current[0];
    target?.focus({ preventScroll: true });
  }, [open, activeIndex]);

  const close = (refocusTrigger = true) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  };

  const choose = (value: string) => {
    setTheme(value);
    close();
  };

  const focusItem = (index: number) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!items.length) return;
    items[(index + items.length) % items.length]?.focus({ preventScroll: true });
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.findIndex((el) => el === document.activeElement);
    if (event.key === "Escape") {
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="theme-switcher-menu"
        aria-label={mounted ? "切换主题，当前为" + current.label : "切换主题"}
        title="切换主题"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-btn border border-border px-2 text-muted transition-colors hover:border-accent hover:text-accent"
      >
        {/* 未挂载前只渲染占位图标，避免服务端与客户端不一致 */}
        <span aria-hidden className="text-base leading-none">
          {mounted ? current.icon : "☀"}
        </span>
        <span className="hidden text-xs font-medium sm:inline">
          {mounted ? current.label : "主题"}
        </span>
        <span aria-hidden className="text-[10px] leading-none opacity-70">
          ▾
        </span>
      </button>

      {mounted && open ? (
        <div
          id="theme-switcher-menu"
          role="menu"
          aria-label="选择主题"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-modal border border-border bg-card shadow-raised"
        >
          {THEMES.map((item, index) => {
            const selected = item.value === current.value;
            return (
              <button
                key={item.value}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => choose(item.value)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent-soft",
                  selected && "bg-accent-soft"
                )}
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-btn border border-border text-sm"
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {item.desc}
                  </span>
                </span>
                {selected ? (
                  <span aria-hidden className="shrink-0 text-sm text-accent">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
