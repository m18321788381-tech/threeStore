"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  /**
   * 后果说明。不可逆操作**必须**在这里写清「会影响什么、能不能恢复」——
   * 用原生 window.confirm 换掉它的最大意义就在这里：原生弹窗放不下这些信息，
   * 且无法套用站点主题，在三主题体系里尤其割裂。
   */
  description: string;
  confirmLabel?: string;
  /** 危险操作（删除等）：确认按钮用 error 语义色。 */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确定",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 打开时把焦点移到确认按钮（键盘用户不必先 Tab 一圈），Esc 关闭。
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="card w-full max-w-sm p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-muted">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={onCancel}
            disabled={pending}
          >
            取消
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={cn(danger ? "btn-danger" : "btn-primary", "btn-sm")}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
