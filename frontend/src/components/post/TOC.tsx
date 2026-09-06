"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/types";
import { cn } from "@/lib/utils";

export function TOC({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (!items.length) return;
    const headings = items
      .map((item) => document.getElementById(item.anchor))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -66% 0px", threshold: [0, 1] }
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;

  return (
    <nav aria-label="目录" className="text-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        本页目录
      </p>
      <ul className="space-y-1 border-l border-border">
        {items.map((item) => (
          <li key={item.anchor}>
            <a
              href={`#${item.anchor}`}
              className={cn(
                "-ml-px block border-l py-1 pr-2 text-[13px] leading-snug transition-colors",
                item.level >= 3 ? "pl-7" : "pl-4",
                activeId === item.anchor
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
