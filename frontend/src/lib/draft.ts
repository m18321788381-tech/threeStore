"use client";

/**
 * 本地草稿（防丢稿）。
 *
 * 为什么放 localStorage 而不是自动提交到后端：
 *  - 后端草稿会污染「文章列表」与版本，用户只是写了一半不该留下服务端痕迹；
 *  - localStorage 写入是同步且几乎零成本的，30s 定时 + 变更防抖双重触发，
 *    即使标签页被强杀/浏览器崩溃，最多丢 30 秒内容。
 *
 * 快照按文章维度隔离：新建用 `new`，编辑用真实 postId，两者互不覆盖。
 */

export type DraftSnapshot = {
  title: string;
  slug: string;
  summary: string;
  cover_url: string;
  content_md: string;
  category_id: string;
  tag_ids: string[];
  status: number;
  /** 写入时刻（毫秒时间戳），用于「发现于 x 分钟前」提示 */
  saved_at: number;
};

export type DraftForm = Omit<DraftSnapshot, "saved_at">;

const PREFIX = "blog:draft:";

export function draftKey(postId?: string) {
  return `${PREFIX}${postId || "new"}`;
}

export function readDraft(key: string): DraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.content_md !== "string" || typeof parsed.title !== "string") {
      return null;
    }
    return {
      ...parsed,
      tag_ids: Array.isArray(parsed.tag_ids) ? parsed.tag_ids : [],
      saved_at: Number(parsed.saved_at) || 0,
    };
  } catch {
    // 隐私模式下 localStorage 可能抛异常，或内容被其他标签页写坏：一律当没有草稿
    return null;
  }
}

export function writeDraft(key: string, form: DraftForm): boolean {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...form, saved_at: Date.now() })
    );
    return true;
  } catch {
    // 配额超限（正文很长 + 多篇文章草稿）不应打断写作，静默失败
    return false;
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

/** 内容级比较：用于判断本地草稿是否真的比服务端内容新，避免每次进页面都弹恢复提示 */
export function sameDraft(a: DraftForm, b: DraftForm): boolean {
  return (
    a.title === b.title &&
    a.slug === b.slug &&
    a.summary === b.summary &&
    a.cover_url === b.cover_url &&
    a.content_md === b.content_md &&
    a.category_id === b.category_id &&
    a.status === b.status &&
    a.tag_ids.length === b.tag_ids.length &&
    a.tag_ids.every((id, i) => id === b.tag_ids[i])
  );
}

/** 把时间戳渲染成「刚刚 / 3 分钟前 / 14:07」这类短文案 */
export function draftAgeLabel(savedAt: number): string {
  if (!savedAt) return "未知时间";
  const diff = Date.now() - savedAt;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(savedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function clockLabel(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
