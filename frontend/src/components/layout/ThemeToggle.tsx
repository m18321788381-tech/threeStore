"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="切换明暗主题"
      title="切换明暗主题"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-accent ${className}`}
    >
      {/* 未挂载前渲染占位，避免服务端/客户端不一致 */}
      <span aria-hidden className="text-base leading-none">
        {mounted ? (isDark ? "☾" : "☀") : "☀"}
      </span>
    </button>
  );
}
