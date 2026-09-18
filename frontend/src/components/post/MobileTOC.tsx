"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/types";
import { TOC } from "./TOC";
import { cn } from "@/lib/utils";

/* 移动端目录。

   桌面端目录常驻侧栏（见 posts/[slug]/page.tsx 的 aside），但它在 lg 以下
   是整块隐藏的 —— 手机读者读长文时因此完全没有目录可用。这里补一个
   可折叠的入口，只在窄屏显示，内容复用同一个 TOC 组件。 */
export function MobileTOC({ items }: { items: TocItem[] }) {
  const [open, setOpen] = useState(false);

  /* 跳到某个标题后自动收起：否则遮住正文，读者还得再点一次 */
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a[href^="#"]')) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  if (!items.length) return null;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="reading-tools__btn"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>本页目录</span>
        <span className="text-muted tabular-nums">({items.length})</span>
      </button>
      {open && (
        <div className={cn("mt-3 rounded-panel border border-border bg-card p-3")}>
          <TOC items={items} />
        </div>
      )}
    </div>
  );
}
