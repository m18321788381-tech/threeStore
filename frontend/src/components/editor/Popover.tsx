"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 轻量弹层：点击外部或按 Esc 关闭。
 *
 * 不引入弹层库：这里只需要「锚定在按钮下方 + 点外关闭」，
 * 一个 ref 加两个 document 监听就够了，而弹层库会带来焦点陷阱、
 * 定位引擎等一整套我们用不到的复杂度。
 */
export function Popover({
  open,
  onClose,
  align = "left",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className={cn("md-pop", align === "right" && "md-pop-right", className)}>
      {children}
    </div>
  );
}