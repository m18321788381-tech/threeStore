"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PREFS,
  FONT_SIZE_OPTIONS,
  isReadingKey,
  LINE_HEIGHT_OPTIONS,
  MEASURE_OPTIONS,
  applyPrefs,
  clearPosition,
  isBookmarked,
  readPosition,
  readPrefs,
  savePosition,
  shouldOfferResume,
  toggleBookmark,
  writePrefs,
  type ReadingPrefs,
} from "@/lib/reading";

type Props = {
  slug: string;
  title: string;
  summary?: string;
};

/* 阅读工具栏：阅读偏好 + 继续阅读 + 稍后读。
   三者都是纯本地能力（见 lib/reading.ts），不产生任何网络请求，
   因此即使后端不可用也完全可用。 */
export function ReadingTools({ slug, title, summary }: Props) {
  const [prefs, setPrefs] = useState<ReadingPrefs>(DEFAULT_PREFS);
  const [marked, setMarked] = useState(false);
  const [resume, setResume] = useState<{ ratio: number; anchor: string } | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);

  /* 偏好：挂载后从本地读取并应用。首屏一律按默认排版渲染（服务端没有
     localStorage），挂载后再切到读者自己的设置。 */
  useEffect(() => {
    const stored = readPrefs();
    setPrefs(stored);
    applyPrefs(stored);
    setMarked(isBookmarked(slug));
  }, [slug]);

  /* 跨标签页同步：另一个标签页改了偏好或收藏，这里跟着更新。
     storage 事件对任何 localStorage 写入都会触发，先按 key 过滤掉
     与本页无关的写入，避免无谓地重读偏好、重算收藏状态。 */
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !isReadingKey(event.key)) return;
      const stored = readPrefs();
      setPrefs(stored);
      applyPrefs(stored);
      setMarked(isBookmarked(slug));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [slug]);

  /* 继续阅读：进页面时读一次上次位置 */
  useEffect(() => {
    const saved = readPosition(slug);
    if (shouldOfferResume(saved)) {
      setResume({ ratio: saved.ratio, anchor: saved.anchor });
    }
  }, [slug]);

  /* 滚动过程中记录阅读位置 */
  const lastAnchor = useRef("");
  /* 读者点了「忽略」后抑制落盘：effect 清理时必定会补一次 commit，
     不抑制的话刚清掉的位置当场又被写回去，「忽略」等于没生效。

     记录被忽略时刻的进度而不是用布尔标记：收回横幅会让文档变矮，
     可能触发一次滚动回调，若在那里直接解除抑制就前功尽弃。这里比对
     进度是否真的变了 —— 布局抖动带来的微小变化继续忽略，读者重新
     滚动超过阈值才恢复记录。 */
  const ignoredRatioRef = useRef<number | null>(null);
  useEffect(() => {
    let raf = 0;
    const commit = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const ratio = Math.min(1, Math.max(0, window.scrollY / scrollable));
      const ignored = ignoredRatioRef.current;
      if (ignored !== null && Math.abs(ratio - ignored) < 0.02) return;
      ignoredRatioRef.current = null;
      savePosition(slug, ratio, lastAnchor.current);
    };
    /* 记录视野内最后一个已显示的标题锚点：字号或版心变化后比例会漂，
       而锚点是稳定的定位依据。 */
    const updateAnchor = () => {
      const headings = document.querySelectorAll<HTMLElement>(
        ".prose-blog h2[id], .prose-blog h3[id], .prose-blog h4[id]"
      );
      let current = "";
      for (const h of Array.from(headings)) {
        /* 不能用 break 提前退出：滚到中后段时，前面的标题可能全部已滚过
           视口顶部（top 为负），第一个就 > 120 会让循环当场结束，
           锚点永远记成空字符串。这里扫完全部标题，取最后一个读过的。 */
        if (h.getBoundingClientRect().top <= 120) current = h.id;
      }
      lastAnchor.current = current;
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        /* 顺序不能反：commit 会读 lastAnchor.current，必须先按当前滚动位置
           更新锚点再落盘，否则每次写入的都是上一帧的（首次滚动时为空）。 */
        updateAnchor();
        commit();
      });
    };

    updateAnchor();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      /* 离开页面时补一次写入，避免最后一次滚动没被记录。
         同样要先刷新锚点，否则丢的正好是最后那一段的锚点。 */
      updateAnchor();
      commit();
    };
  }, [slug]);

  const update = useCallback((patch: Partial<ReadingPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(next);
      applyPrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    writePrefs(DEFAULT_PREFS);
    applyPrefs(DEFAULT_PREFS);
    setPrefs(DEFAULT_PREFS);
  }, []);

  const onToggleMark = useCallback(() => {
    setMarked(toggleBookmark({ slug, title, summary }));
  }, [slug, title, summary]);

  const jumpToResume = useCallback(() => {
    if (!resume) return;
    /* 优先按标题锚点定位：字号/版心变化后比例会漂，锚点不会 */
    if (resume.anchor) {
      const el = document.getElementById(resume.anchor);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setResume(null);
        return;
      }
    }
    const doc = document.documentElement;
    const top = (doc.scrollHeight - window.innerHeight) * resume.ratio;
    window.scrollTo({ top, behavior: "smooth" });
    setResume(null);
  }, [resume]);

  const modified = useMemo(
    () =>
      prefs.fontSize !== DEFAULT_PREFS.fontSize ||
      prefs.lineHeight !== DEFAULT_PREFS.lineHeight ||
      prefs.measure !== DEFAULT_PREFS.measure,
    [prefs]
  );

  return (
    <>
      {resume && (
        <div className="resume-banner" role="status">
          <span className="text-meta text-muted">
            上次读到 {Math.round(resume.ratio * 100)}% 处
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={jumpToResume}>
              继续阅读
            </button>
            <button
              type="button"
              className="text-meta text-muted hover:text-accent"
              onClick={() => {
                /* 先记下当前进度，再清位置：顺序反了会把清除后的空状态
                   当成「被忽略的进度」，抑制阈值随之失真。 */
                const doc = document.documentElement;
                const scrollable = doc.scrollHeight - window.innerHeight;
                ignoredRatioRef.current =
                  scrollable > 0
                    ? Math.min(1, Math.max(0, window.scrollY / scrollable))
                    : 0;
                clearPosition(slug);
                setResume(null);
              }}
            >
              忽略
            </button>
          </div>
        </div>
      )}

      <div className="reading-tools">
        <button
          type="button"
          aria-pressed={marked}
          onClick={onToggleMark}
          className={cn("reading-tools__btn", marked && "is-active")}
          title={marked ? "从稍后读移除" : "加入稍后读"}
        >
          <span aria-hidden>{marked ? "★" : "☆"}</span>
          <span>{marked ? "已收藏" : "稍后读"}</span>
        </button>

        <button
          type="button"
          aria-expanded={prefsOpen}
          aria-controls="reading-prefs"
          onClick={() => setPrefsOpen((v) => !v)}
          className={cn("reading-tools__btn", modified && "is-active")}
          title="调整阅读排版"
        >
          <span aria-hidden>Aa</span>
          <span>排版</span>
        </button>

        <Link href="/reading" className="reading-tools__btn" title="查看稍后读列表">
          <span aria-hidden>☰</span>
          <span>稍后读列表</span>
        </Link>

        {prefsOpen && (
          <div id="reading-prefs" className="reading-prefs">
            <Row
              label="字号"
              options={FONT_SIZE_OPTIONS}
              value={prefs.fontSize}
              onPick={(v) => update({ fontSize: v })}
            />
            <Row
              label="行距"
              options={LINE_HEIGHT_OPTIONS}
              value={prefs.lineHeight}
              onPick={(v) => update({ lineHeight: v })}
            />
            <Row
              label="版心"
              options={MEASURE_OPTIONS}
              value={prefs.measure}
              onPick={(v) => update({ measure: v })}
            />
            <button
              type="button"
              onClick={reset}
              disabled={!modified}
              className="mt-1 w-full rounded-btn border border-border py-1.5 text-meta text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              恢复默认
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Row<T extends number>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-meta text-muted">{label}</span>
      <div className="flex gap-1" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onPick(opt.value)}
            className={cn(
              "rounded-btn border px-2 py-1 text-xs transition-colors",
              value === opt.value
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
