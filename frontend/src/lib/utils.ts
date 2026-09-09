import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

export function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormatter.format(d).replace(/\//g, "-");
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return dateTimeFormatter.format(d);
}

export function relativeTime(value?: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDate(value);
}

export function readingTimeLabel(minutes?: number): string {
  return `约 ${Math.max(1, minutes ?? 1)} 分钟`;
}

export function initials(name: string): string {
  if (!name) return "?";
  return name.trim().slice(0, 1).toUpperCase();
}

/**
 * 复制文本到剪贴板，自动降级以兼容 HTTP 站点与旧浏览器。
 *
 * **背景**：现代浏览器的 `navigator.clipboard` 仅在安全上下文（HTTPS / localhost）
 * 下可用。直接调用 `navigator.clipboard.writeText` 在 HTTP 站点上会抛
 * `TypeError: Cannot read properties of undefined (reading 'writeText')`。
 *
 * **降级策略**：
 * 1. 优先 `navigator.clipboard.writeText`（异步 API，干净）。
 * 2. 不可用或失败时，使用临时 `<textarea>` + `document.execCommand("copy")`，
 *    这是 HTTP 站点唯一可行的复制方式（已 deprecated，但浏览器仍兼容）。
 * 3. 若全部失败，返回 false，由调用方决定是否降级为「弹出输入框供用户手动复制」。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1) 现代 API：需要安全上下文 + 浏览器支持
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 用户拒绝权限或被策略拦截，落到降级方案
    }
  }

  // 2) 兼容降级：临时 textarea + execCommand
  const ta = document.createElement("textarea");
  ta.value = text;
  // 放在屏幕外但仍需可被 select；不能用 display:none
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  // 选中并复制
  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  // 恢复原选区
  document.body.removeChild(ta);
  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }
  return ok;
}
