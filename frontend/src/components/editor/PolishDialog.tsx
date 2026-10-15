"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * AI 润色对比弹窗。
 *
 * 交互：左栏只读原文、右栏只读润色结果；用户「采纳并替换」后回调把新内容
 * 写回编辑器（由外层走撤销栈，保证可撤销）；可「复制润色结果」「关闭」。
 * 失败时右栏显示错误信息与「重试」按钮。
 * 顶部风格下拉：切换风格自动触发重试，不必关弹窗重点按钮。
 *
 * 刻意不在这里做任何正文修改：润色结果先给人看，确认后才替换，
 * 避免「一键覆盖丢原稿」。
 */
const STYLES: Array<{ key: string; label: string }> = [
  { key: "concise", label: "简洁精炼" },
  { key: "vivid", label: "生动流畅" },
  { key: "professional", label: "专业严谨" },
  { key: "casual", label: "口语化" },
  { key: "expand", label: "润色 + 扩写" },
];

export function PolishDialog({
  open,
  original,
  polished,
  loading,
  error,
  style,
  onStyleChange,
  onAccept,
  onRetry,
  onClose,
}: {
  open: boolean;
  original: string;
  polished: string;
  loading: boolean;
  error: string;
  style: string;
  onStyleChange: (style: string) => void;
  onAccept: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyPolished = async () => {
    try {
      await navigator.clipboard.writeText(polished);
    } catch {
      /* 剪贴板可能被浏览器拦截，静默失败即可 */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI 润色对比"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-modal border border-border bg-card shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">AI 润色对比</h3>
          <label className="flex items-center gap-2 text-xs text-muted">
            风格
            <select
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              disabled={loading}
              className="input py-1 text-xs"
              aria-label="润色风格"
            >
              {STYLES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="md-tool"
          >
            关闭
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-hidden bg-border md:grid-cols-2">
          <Pane title="原文" muted>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted">
              {original || "（空）"}
            </pre>
          </Pane>
          <Pane title="润色结果" accent>
            {loading ? (
              <div className="flex h-full items-center justify-center py-10 text-sm text-muted">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  正在润色…
                </span>
              </div>
            ) : error ? (
              <div className="space-y-3 py-6">
                <p className="rounded-btn border border-error/40 bg-error/5 px-3 py-2 text-xs text-error">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="btn-ghost btn-sm"
                >
                  重试
                </button>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                {polished || "（空）"}
              </pre>
            )}
          </Pane>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={copyPolished} className="btn-ghost btn-sm" disabled={loading || !!error || !polished}>
            复制润色结果
          </button>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">
            取消
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="btn-primary btn-sm"
            disabled={loading || !!error || !polished}
          >
            采纳并替换正文
          </button>
        </div>
      </div>
    </div>
  );
}

function Pane({
  title,
  muted,
  accent,
  children,
}: {
  title: string;
  muted?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-card">
      <div className="border-b border-border px-4 py-2 text-xs">
        <span className={cn("font-medium", accent ? "text-accent" : muted ? "text-muted" : "")}>
          {title}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
    </div>
  );
}
