/**
 * 阅读端本地状态：阅读偏好、稍后读、阅读位置。
 *
 * 三者全部只存 localStorage，不进数据库。理由一致：它们都是**单个读者
 * 私有的偏好**，既不需要跨设备同步，也不该在服务端留下任何阅读痕迹。
 * 这与站点「不采集读者行为、不做推荐算法」的立场是一致的。
 *
 * 所有读写都对 localStorage 不可用（隐私模式、配额超限）做了兜底，
 * 失败时静默降级为「本次会话内有效」，绝不因为存不了偏好就打断阅读。
 */

/* ------------------------------------------------------------ 阅读偏好 --- */

/** 本模块写入 localStorage 的 key 统一前缀。 */
const READING_KEY_PREFIX = "blog:reading:";

/**
 * 该 localStorage key 是否属于阅读端本地状态。
 *
 * 给 storage 事件监听用：storage 对**任何** key 的写入都会触发，
 * 不过滤的话其他标签页写任何无关数据都会让我们重读偏好、重算收藏。
 */
export function isReadingKey(key: string): boolean {
  return key.startsWith(READING_KEY_PREFIX);
}

export type ReadingPrefs = {
  /** 正文字号（px） */
  fontSize: number;
  /** 正文行高（倍数） */
  lineHeight: number;
  /** 版心宽度（px）：单行容纳的字数，直接影响长文阅读疲劳度 */
  measure: number;
};

export const DEFAULT_PREFS: ReadingPrefs = {
  fontSize: 17,
  lineHeight: 1.8,
  measure: 720,
};

export const FONT_SIZE_OPTIONS = [
  { value: 16, label: "小" },
  { value: 17, label: "标准" },
  { value: 19, label: "大" },
  { value: 21, label: "特大" },
];

export const LINE_HEIGHT_OPTIONS = [
  { value: 1.6, label: "紧凑" },
  { value: 1.8, label: "标准" },
  { value: 2.0, label: "宽松" },
];

export const MEASURE_OPTIONS = [
  { value: 640, label: "窄" },
  { value: 720, label: "标准" },
  { value: 820, label: "宽" },
];

const PREFS_KEY = `${READING_KEY_PREFIX}prefs`;

export function readPrefs(): ReadingPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReadingPrefs>;
    return {
      fontSize: clampNumber(parsed.fontSize, 14, 24, DEFAULT_PREFS.fontSize),
      lineHeight: clampNumber(parsed.lineHeight, 1.4, 2.4, DEFAULT_PREFS.lineHeight),
      measure: clampNumber(parsed.measure, 560, 960, DEFAULT_PREFS.measure),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(prefs: ReadingPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* 存不下就算了，本次会话内仍然生效 */
  }
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * 把偏好写成 CSS 变量。
 *
 * 走 CSS 变量而不是逐个改元素样式：正文、目录、引用块等都由同一个变量驱动，
 * 新增受影响元素时不需要改 JS。globals.css 里都带了默认值兜底，
 * 因此这个函数没跑（或禁用 JS）时页面仍是默认排版。
 */
export function applyPrefs(prefs: ReadingPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--reading-font-size", `${prefs.fontSize}px`);
  root.style.setProperty("--reading-line-height", String(prefs.lineHeight));
  root.style.setProperty("--reading-measure", `${prefs.measure}px`);
}

/* -------------------------------------------------------------- 稍后读 --- */

export type Bookmark = {
  slug: string;
  title: string;
  summary: string;
  /** 保存时刻（毫秒时间戳） */
  saved_at: number;
};

const BOOKMARK_KEY = `${READING_KEY_PREFIX}bookmarks`;
/** 上限：本地列表是给读者自己看的，无上限增长只会让页面越滚越长 */
const BOOKMARK_LIMIT = 200;

export function readBookmarks(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Bookmark =>
          Boolean(item) && typeof item.slug === "string" && typeof item.title === "string"
      )
      .map((item) => ({
        slug: item.slug,
        title: item.title,
        summary: typeof item.summary === "string" ? item.summary : "",
        saved_at: clampTimestamp(item.saved_at),
      }));
  } catch {
    return [];
  }
}

/**
 * 把 saved_at 收敛成「可安全交给 Date 处理」的时间戳。
 *
 * localStorage 是外部输入：手改、旧版本残留、其他脚本写入都可能塞进
 * 超出 Date 表示范围的值（±8.64e15 之外会让 toISOString() 直接抛
 * RangeError）。这里统一夹到合法区间，非法值归零，顺带让排序结果稳定。
 */
function clampTimestamp(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 8.64e15);
}

function saveBookmarks(items: Bookmark[]): void {
  try {
    window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(items.slice(0, BOOKMARK_LIMIT)));
  } catch {
    /* 忽略 */
  }
}

export function isBookmarked(slug: string): boolean {
  return readBookmarks().some((item) => item.slug === slug);
}

/** 切换稍后读状态，返回切换后是否已收藏。 */
export function toggleBookmark(post: {
  slug: string;
  title: string;
  summary?: string;
}): boolean {
  const items = readBookmarks();
  const index = items.findIndex((item) => item.slug === post.slug);
  if (index >= 0) {
    items.splice(index, 1);
    saveBookmarks(items);
    return false;
  }
  // 新增放最前：读者多半是想看刚收藏的那篇
  items.unshift({
    slug: post.slug,
    title: post.title,
    summary: post.summary || "",
    saved_at: Date.now(),
  });
  saveBookmarks(items);
  return true;
}

export function removeBookmark(slug: string): void {
  saveBookmarks(readBookmarks().filter((item) => item.slug !== slug));
}

/** 清空全部稍后读。单独提供一个批量入口：逐条 removeBookmark 会让
    「清空全部」退化成 N 次「读全量 → 过滤 → 写全量」，200 条时明显卡顿。 */
export function clearBookmarks(): void {
  try {
    window.localStorage.removeItem(BOOKMARK_KEY);
  } catch {
    /* 忽略 */
  }
}

/* ---------------------------------------------------------- 阅读位置 --- */

type Position = {
  /** 滚动进度 0~1 */
  ratio: number;
  /** 最近一个已读标题的锚点，用于在字号变化后更稳地定位 */
  anchor: string;
  ts: number;
};

const POSITION_PREFIX = `${READING_KEY_PREFIX}pos:`;
/** 只保留最近 N 篇的位置，避免 localStorage 里堆成历史包袱 */
const POSITION_LIMIT = 50;
const INDEX_KEY = `${POSITION_PREFIX}index`;

function readIndex(): string[] {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function savePosition(slug: string, ratio: number, anchor: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Position = { ratio, anchor, ts: Date.now() };
    window.localStorage.setItem(POSITION_PREFIX + slug, JSON.stringify(payload));
    const index = readIndex().filter((s) => s !== slug);
    index.unshift(slug);
    for (const stale of index.slice(POSITION_LIMIT)) {
      window.localStorage.removeItem(POSITION_PREFIX + stale);
    }
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, POSITION_LIMIT)));
  } catch {
    /* 忽略 */
  }
}

export function readPosition(slug: string): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POSITION_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    const ratio = Number(parsed.ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    return {
      ratio: Math.min(1, ratio),
      anchor: typeof parsed.anchor === "string" ? parsed.anchor : "",
      ts: Number(parsed.ts) || 0,
    };
  } catch {
    return null;
  }
}

export function clearPosition(slug: string): void {
  try {
    window.localStorage.removeItem(POSITION_PREFIX + slug);
    /* 索引里也要摘掉：否则留下一个永远指向空数据的孤儿 slug。
       savePosition 只按 POSITION_LIMIT 截断，清不掉限额内的孤儿，
       之后每次 readIndex() 都会白扫一遍。 */
    const index = readIndex().filter((s) => s !== slug);
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* 忽略 */
  }
}

/** 位置是否值得提示「继续阅读」：太靠前或太靠后都没有意义。 */
export function shouldOfferResume(position: Position | null): position is Position {
  if (!position) return false;
  return position.ratio >= 0.05 && position.ratio <= 0.95;
}
