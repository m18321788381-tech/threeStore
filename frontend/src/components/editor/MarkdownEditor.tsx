"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  buildImage,
  buildLink,
  buildTable,
  continueListOnEnter,
  detectActive,
  detectWikiQuery,
  indentLines,
  insertBlock,
  insertCodeBlock,
  matchTitles,
  setHeading,
  textStats,
  toggleInline,
  toggleList,
  toggleQuote,
  wrapSelection,
  type EditResult,
  type ListKind,
  type Sel,
} from "@/lib/markdownEdit";
import { htmlToMarkdown, shouldConvertHtml } from "@/lib/htmlToMarkdown";
import { EditorToolbar, type InlineKind } from "./EditorToolbar";
import { PreviewPane, type PreviewState } from "./PreviewPane";
import { Popover } from "./Popover";
import { CollapseIcon, ExpandIcon } from "./icons";
import type { TocItem } from "@/types";

/**
 * Markdown 编辑器，对标公众号文章编辑页。
 *
 * 与公众号一致的地方（也是本文件的主要职责）：
 *   1. 分组工具栏 + 撤销/重做 + 快捷键，格式操作不必记语法；
 *   2. **预览即最终效果**：预览渲染后端返回的同一份 HTML（同一套渲染管线），
 *      而不是本地另一套 Markdown 渲染器；
 *   3. 手机预览（公众号右侧的手机框）：正文按 375px 窄屏排版，所见即读者所见；
 *   4. 图片支持 alt + 图注、粘贴截图、拖拽上传；
 *   5. 全屏专注模式，写作时不被表单其它字段干扰；
 *   6. 从公众号/Word/网页粘贴富文本自动转 Markdown；
 *   7. 状态栏给字数、段落、图片数、阅读时长；`[[标题]]` 自动补全。
 *
 * 刻意没做的：把 textarea 换成富文本编辑器（contentEditable）。
 * 本站正文的存储形态是 Markdown，正文里还有 [[双向链接]]、公式、Mermaid、
 * 代码块文件名等 Markdown 专有语法；换成富文本会让这些语法在编辑态失去载体，
 * 也会让「保存后渲染」这条链路失去唯一真源。公众号自己的编辑器是 HTML 富文本，
 * 但它没有这些语法，两者的取舍不同。
 */

type Mode = "edit" | "split" | "preview";
type Device = "desktop" | "phone";

const INLINE_MARKERS: Record<InlineKind, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  code: "`",
};

/** 预览请求防抖：打字时不必每个字符都打后端；600ms 是可感知流畅与请求量的折中。 */
const PREVIEW_DEBOUNCE = 600;
/** 撤销栈上限：一篇长文的历史快照是整段文本，不设上限会一直吃内存。 */
const HISTORY_LIMIT = 200;
/** 连续输入合并窗口：这段时间内的输入合并成一个撤销点，避免一个字一次撤销。 */
const TYPING_BURST = 400;
/**
 * 单个撤销点的最大跨度（字符）。
 *
 * 只按时间合并会有一个反直觉的后果：一口气打完 200 字（中间没有 400ms 停顿）
 * 只留一个撤销点，撤销一次整段都没了。加上长度上限后，最坏情况是每 ~60 字
 * 一个撤销点，与浏览器原生撤销的手感接近。
 */
const BURST_MAX_CHARS = 60;

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "Ctrl/⌘ + B", label: "加粗" },
  { keys: "Ctrl/⌘ + I", label: "斜体" },
  { keys: "Ctrl/⌘ + Shift + X", label: "删除线" },
  { keys: "Ctrl/⌘ + Alt + E", label: "行内代码" },
  { keys: "Ctrl/⌘ + K", label: "插入链接" },
  { keys: "Ctrl/⌘ + Alt + 1 / 2 / 3", label: "一 / 二 / 三级标题（再按一次取消）" },
  { keys: "Ctrl/⌘ + Alt + 0", label: "变回正文段落" },
  { keys: "Ctrl/⌘ + Shift + 7 / 8 / 9", label: "有序 / 无序 / 任务列表" },
  { keys: "Ctrl/⌘ + Shift + Q", label: "引用" },
  { keys: "Ctrl/⌘ + Alt + C", label: "代码块" },
  { keys: "Tab / Shift + Tab", label: "列表层级缩进 / 反缩进" },
  { keys: "Enter", label: "自动续写列表项（空条目再回车退出列表）" },
  { keys: "Ctrl/⌘ + Z / Shift + Z", label: "撤销 / 重做" },
  { keys: "Ctrl/⌘ + S", label: "保存为草稿" },
  { keys: "Ctrl/⌘ + /", label: "打开本快捷键面板" },
  { keys: "Esc", label: "退出全屏专注模式 / 关闭弹层" },
];

/** 本地推导目录：后端预览尚未返回时也能给出大纲，避免大纲一闪一空。 */
function deriveToc(value: string): TocItem[] {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  value.split("\n").forEach((line) => {
    const matched = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!matched) return;
    const text = matched[2].replace(/[`*_~[\]]/g, "").trim();
    const base =
      text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff\- ]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    items.push({ level: matched[1].length, text, anchor: count === 1 ? base : `${base}-${count}` });
  });
  return items;
}

export function MarkdownEditor({
  value,
  onChange,
  knownTitles = [],
  onUpload,
  postId,
  onSaveDraft,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 已有文章标题，用于 [[ ]] 自动补全 */
  knownTitles?: string[];
  onUpload?: (file: File) => Promise<string | null>;
  /** 正在编辑的文章 id：预览时用于忽略 [[自引用]] */
  postId?: string;
  /** Ctrl/⌘+S：交给外层保存草稿 */
  onSaveDraft?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("split");
  const [device, setDevice] = useState<Device>("desktop");
  const [immersive, setImmersive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [sel, setSel] = useState<Sel>({ start: 0, end: 0 });
  const [preview, setPreview] = useState<PreviewState & { toc: TocItem[] }>({
    html: "",
    degraded: false,
    pending: false,
    toc: [],
  });
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const burstRef = useRef<{ at: number; base: string } | null>(null);
  const seqRef = useRef(0);
  const scrollLockRef = useRef<"editor" | "preview" | null>(null);

  const stats = useMemo(() => textStats(value), [value]);
  const active = useMemo(() => detectActive(value, sel), [value, sel]);
  const toc = useMemo(
    () => (preview.toc.length ? preview.toc : deriveToc(value)),
    [preview.toc, value]
  );
  const wikiCandidates = useMemo(() => {
    if (mode === "preview" || !knownTitles.length) return null;
    const query = detectWikiQuery(value, sel.start);
    if (!query) return null;
    const items = matchTitles(knownTitles, query.query);
    return items.length ? { from: query.from, items } : null;
  }, [value, sel.start, knownTitles, mode]);

  // 一次扫描同时得到「总处数」与「目标不存在的处数」，避免状态栏做两遍正则
  const { wikiCount, unresolved } = useMemo(() => {
    const targets = Array.from(value.matchAll(/\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g)).map(
      (match) => match[1].trim()
    );
    const missing = targets.filter(
      (target) => !knownTitles.some((title) => title.toLowerCase() === target.toLowerCase())
    );
    return { wikiCount: targets.length, unresolved: missing };
  }, [value, knownTitles]);

  /* ------------------------------------------------------------ 选区与焦点 */
  const readSelection = (): Sel => {
    const el = textareaRef.current;
    return el ? { start: el.selectionStart, end: el.selectionEnd } : sel;
  };

  const syncSelection = () => {
    const next = readSelection();
    setSel((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  };

  const focusSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = start;
      el.selectionEnd = end;
      setSel({ start, end });
    });
  };

  /* ------------------------------------------------------------------ 撤销 */
  /**
   * 记录撤销点。
   *
   * coalesce = true 表示「这是一次连续输入中的一次按键」：600ms 内的连续输入
   * 合并成一个撤销点，否则撤销会退化成一个字一个字地退。
   * 工具栏操作、粘贴、上传一律 coalesce = false，保证一次操作一次撤销。
   */
  const pushSnapshot = (previous: string, coalesce: boolean) => {
    const now = Date.now();
    const burst = burstRef.current;
    futureRef.current = [];
    const continuing =
      coalesce &&
      burst !== null &&
      now - burst.at < TYPING_BURST &&
      Math.abs(previous.length - burst.base.length) <= BURST_MAX_CHARS;
    if (continuing) {
      burst.at = now;
      return;
    }
    const past = pastRef.current;
    if (past[past.length - 1] !== previous) past.push(previous);
    if (past.length > HISTORY_LIMIT) past.shift();
    burstRef.current = { at: now, base: previous };
    setHistory({ canUndo: true, canRedo: false });
  };

  const applyEdit = (result: EditResult) => {
    if (result.value === value) {
      focusSelection(result.start, result.end);
      return;
    }
    pushSnapshot(value, false);
    onChange(result.value);
    focusSelection(result.start, result.end);
  };

  const run = (transform: (text: string, selection: Sel) => EditResult) => {
    applyEdit(transform(value, readSelection()));
  };

  const undo = () => {
    const previous = pastRef.current.pop();
    if (previous === undefined) return;
    futureRef.current.push(value);
    burstRef.current = null;
    onChange(previous);
    setHistory({ canUndo: pastRef.current.length > 0, canRedo: true });
    const caret = Math.min(readSelection().start, previous.length);
    focusSelection(caret, caret);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (next === undefined) return;
    pastRef.current.push(value);
    burstRef.current = null;
    onChange(next);
    setHistory({ canUndo: true, canRedo: futureRef.current.length > 0 });
    const caret = Math.min(readSelection().start, next.length);
    focusSelection(caret, caret);
  };

  /* ------------------------------------------------------------ 图片上传 */
  /**
   * 批量插入图片（文件选择 / 粘贴截图 / 拖拽共用同一条路径）。
   *
   * 为什么自己累积 buffer 与 cursor：多张图是「上传一张 → onChange 一次」的
   * 串行流程，第二轮进循环时 props 里的 value 还是上一轮渲染的旧值
   * （React 状态尚未回流），照旧值切片会把前一张图整段覆盖掉。
   */
  const handleFiles = async (files: File[]) => {
    if (!onUpload) return;
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;

    setUploading(true);
    // 整批图片只占一个撤销点，撤销一次即可回到「上传前」
    pushSnapshot(value, false);
    let buffer = value;
    let cursor = readSelection().start;
    try {
      for (const file of images) {
        const url = await onUpload(file);
        // 单张失败（超体积上限、类型不符）不该中断其余图片
        if (!url) continue;
        const snippet = `\n![${file.name}](${url})\n`;
        buffer = buffer.slice(0, cursor) + snippet + buffer.slice(cursor);
        cursor += snippet.length;
        onChange(buffer);
      }
    } finally {
      setUploading(false);
      focusSelection(cursor, cursor);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 1) 截图优先：剪贴板里同时有图片与 HTML 时，图片是作者的真实意图
    if (onUpload) {
      const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (images.length) {
        // 不拦截的话，部分环境会把文件当纯文本处理，往正文里插一行 "image.png"
        event.preventDefault();
        void handleFiles(images);
        return;
      }
    }

    // 2) 富文本（公众号 / Word / 网页）转 Markdown
    const html = event.clipboardData?.getData("text/html") ?? "";
    if (!html || !shouldConvertHtml(html)) return;
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    const markdown = htmlToMarkdown(html);
    if (!markdown) return;
    // 转换结果比纯文本还短一大截，说明结构识别不可靠（多为样式噪声），
    // 这种时候按纯文本粘贴更符合预期
    if (markdown.replace(/\s/g, "").length < plain.replace(/\s/g, "").length * 0.6) return;

    event.preventDefault();
    const selection = readSelection();
    pushSnapshot(value, false);
    onChange(value.slice(0, selection.start) + markdown + value.slice(selection.end));
    const anchor = selection.start + markdown.length;
    focusSelection(anchor, anchor);
  };

  /** dragover 阶段拿不到 File 对象，只能靠 types 判断是否携带文件 */
  const carriesFiles = (event: React.DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onUpload || !carriesFiles(event)) return;
    // 不 preventDefault，浏览器会拒绝把 drop 事件派发过来
    event.preventDefault();
    if (!dragging) setDragging(true);
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    // dragleave 在移过子元素时也会触发，靠 relatedTarget 判断是否真的离开了容器
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDragging(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onUpload) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.some((file) => file.type.startsWith("image/"))) {
      setDragging(false);
      return;
    }
    event.preventDefault();
    setDragging(false);
    void handleFiles(files);
  };

  /* ------------------------------------------------------------------ 预览 */
  useEffect(() => {
    // 纯编辑模式不请求预览：作者还没看预览，没必要为每个字符打后端
    if (mode === "edit") return;
    if (!value.trim()) {
      setPreview({ html: "", degraded: false, pending: false, toc: [] });
      return;
    }
    setPreview((prev) => ({ ...prev, pending: true }));
    const timer = setTimeout(() => {
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      api
        .previewPost({ content_md: value, post_id: postId ?? null })
        .then((data) => {
          // 期间又改了正文：丢弃这次过期结果，避免预览倒退
          if (seq !== seqRef.current) return;
          setPreview({ html: data.html, toc: data.toc ?? [], degraded: false, pending: false });
        })
        .catch(() => {
          if (seq !== seqRef.current) return;
          setPreview((prev) => ({ ...prev, degraded: true, pending: false }));
        });
    }, PREVIEW_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [value, mode, postId]);

  /* -------------------------------------------------------- 沉浸模式与键盘 */
  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      // 快捷键面板开着时 Esc 只关面板，不连带退出全屏
      if (event.key === "Escape" && !shortcutsOpen) setImmersive(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [immersive, shortcutsOpen]);

  /**
   * Esc 关闭快捷键面板。
   *
   * 面板是自绘遮罩（不是 Popover），原先只有「点遮罩」「点关闭按钮」两条关闭路径，
   * 但快捷键说明里写着「Esc 退出全屏专注模式 / 关闭弹层」—— 键盘用户按 Esc 关不掉
   * 面板，只能去够鼠标。这里补上与 Popover 一致的 Esc 行为。
   *
   * 注册顺序有讲究：两个监听都挂在 document 上，按注册顺序触发。本 effect 声明在
   * 沉浸模式那个 effect 之后，因此总是后注册、后触发；沉浸模式的处理器看到
   * shortcutsOpen 为真会主动跳过（见上），于是 Esc 只关面板、不会连带退出全屏，
   * 再按一次才退出全屏。
   */
  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShortcutsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcutsOpen]);

  useEffect(() => {
    if (!immersive) return;
    textareaRef.current?.focus();
  }, [immersive]);

  const acceptWiki = (title: string) => {
    const caret = readSelection().start;
    const query = detectWikiQuery(value, caret);
    if (!query) return;
    const snippet = `[[${title}]]`;
    pushSnapshot(value, false);
    onChange(value.slice(0, query.from) + snippet + value.slice(caret));
    const anchor = query.from + snippet.length;
    focusSelection(anchor, anchor);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 补全面板吃掉的按键优先级最高
    if (wikiCandidates && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      acceptWiki(wikiCandidates.items[0]);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      run((text, selection) => indentLines(text, selection, event.shiftKey));
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const continued = continueListOnEnter(value, readSelection());
      if (continued) {
        event.preventDefault();
        applyEdit(continued);
        return;
      }
    }

    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();

    // 撤销 / 重做交给自己的历史栈：工具栏按钮与快捷键必须共用同一份历史，
    // 否则「点了撤销没反应、按 Ctrl+Z 又退过头」
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (key === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (key === "/") {
      event.preventDefault();
      setShortcutsOpen((prev) => !prev);
      return;
    }
    if (key === "s" && !event.shiftKey && !event.altKey) {
      if (!onSaveDraft) return;
      event.preventDefault();
      onSaveDraft();
      return;
    }

    if (event.altKey) {
      // Alt 组合：Ctrl/⌘+1~3 会被浏览器抢去切标签页，所以标题走 Alt 组合
      const headingMap: Record<string, number> = { "0": 0, "1": 1, "2": 2, "3": 3 };
      const level = headingMap[key];
      if (level === undefined) {
        if (key === "e") {
          event.preventDefault();
          run((text, selection) => toggleInline(text, selection, INLINE_MARKERS.code));
          return;
        }
        if (key === "c") {
          event.preventDefault();
          run((text, selection) => insertCodeBlock(text, selection));
          return;
        }
        return;
      }
      event.preventDefault();
      run((text, selection) => setHeading(text, selection, level));
      return;
    }

    if (event.shiftKey) {
      /* 数字键必须认 event.code 而不是 event.key：Ctrl+Shift+8 在 US 布局下
         event.key 是 "*"，用 key 判断会导致「按了没反应」（浏览器实测确认）。
         event.code 是物理键位（Digit8），与键盘布局无关。 */
      const code = event.code;
      if (code === "Digit7") {
        event.preventDefault();
        run((text, selection) => toggleList(text, selection, "ol"));
        return;
      }
      if (code === "Digit8") {
        event.preventDefault();
        run((text, selection) => toggleList(text, selection, "ul"));
        return;
      }
      if (code === "Digit9") {
        event.preventDefault();
        run((text, selection) => toggleList(text, selection, "task"));
        return;
      }
      if (key === "q") {
        event.preventDefault();
        run((text, selection) => toggleQuote(text, selection));
        return;
      }
      if (key === "x") {
        event.preventDefault();
        run((text, selection) => toggleInline(text, selection, INLINE_MARKERS.strike));
        return;
      }
      return;
    }

    if (key === "b") {
      event.preventDefault();
      run((text, selection) => toggleInline(text, selection, INLINE_MARKERS.bold));
      return;
    }
    if (key === "i") {
      event.preventDefault();
      run((text, selection) => toggleInline(text, selection, INLINE_MARKERS.italic));
      return;
    }
    if (key === "k") {
      event.preventDefault();
      run((text, selection) => buildLink(text, selection, "https://"));
    }
  };

  /* -------------------------------------------------------------- 滚动同步 */
  /**
   * 两侧滚动比例同步。用锁避免互相触发形成回环：
   * 只有「发起方」释放锁之前，另一侧的 scroll 事件被忽略。
   */
  const syncScroll = (from: "editor" | "preview") => {
    if (mode !== "split") return;
    if (scrollLockRef.current && scrollLockRef.current !== from) return;
    const source = from === "editor" ? textareaRef.current : previewRef.current;
    const target = from === "editor" ? previewRef.current : textareaRef.current;
    if (!source || !target) return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) return;
    scrollLockRef.current = from;
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    requestAnimationFrame(() => {
      scrollLockRef.current = null;
    });
  };

  const jumpToHeading = (item: TocItem) => {
    setOutlineOpen(false);
    const root = previewRef.current;
    if (root) {
      const target = Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).find(
        (el) => el.textContent?.trim() === item.text
      );
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    // 编辑区同步定位：按行号比例估算滚动位置（精确的光标滚动依赖浏览器实现，
    // 而这里只需要「大致对上」，不值得为它引入文本测量）
    const el = textareaRef.current;
    if (!el) return;
    const lines = value.split("\n");
    const headingPattern = new RegExp(`^#{${item.level}}\\s`);
    const index = lines.findIndex((line) => headingPattern.test(line) && line.includes(item.text));
    if (index < 0) return;
    el.scrollTop = Math.max(0, (index / Math.max(1, lines.length)) * el.scrollHeight - el.clientHeight / 3);
  };

  const paneHeight = immersive ? "flex-1" : "h-[560px] sm:h-[620px]";

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-panel border transition-colors",
        immersive ? "fixed inset-0 z-50 border-0 bg-background" : dragging ? "border-accent" : "border-border"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <EditorToolbar
        active={active}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        uploading={uploading}
        onInline={(kind) => run((text, selection) => toggleInline(text, selection, INLINE_MARKERS[kind]))}
        onHeading={(level) => run((text, selection) => setHeading(text, selection, level))}
        onList={(kind: ListKind) => run((text, selection) => toggleList(text, selection, kind))}
        onQuote={() => run((text, selection) => toggleQuote(text, selection))}
        onCodeBlock={(lang) => run((text, selection) => insertCodeBlock(text, selection, lang))}
        onDivider={() => run((text, selection) => insertBlock(text, selection, "---"))}
        onTable={(rows, cols) =>
          run((text, selection) => insertBlock(text, selection, buildTable(Math.max(rows - 1, 1), cols)))
        }
        onLink={(url) => run((text, selection) => buildLink(text, selection, url))}
        onImage={(url, alt, caption) =>
          run((text, selection) => insertBlock(text, selection, buildImage(url, alt, caption)))
        }
        onUploadFiles={(files) => void handleFiles(files)}
        onWiki={() => run((text, selection) => wrapSelection(text, selection, "[[", "]]"))}
        onEmoji={(char) => run((text, selection) => wrapSelection(text, selection, char, ""))}
        onUndo={undo}
        onRedo={redo}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      >
        <div className="relative">
          <button
            type="button"
            disabled={toc.length === 0}
            aria-label="文章大纲"
            aria-expanded={outlineOpen}
            title="文章大纲：按标题跳转"
            onClick={() => setOutlineOpen((prev) => !prev)}
            className="md-tool"
          >
            大纲
          </button>
          <Popover open={outlineOpen} onClose={() => setOutlineOpen(false)} align="right">
            <ul className="max-h-64 w-64 overflow-y-auto text-sm">
              {toc.map((item) => (
                <li key={`${item.level}-${item.anchor}`}>
                  <button
                    type="button"
                    onClick={() => jumpToHeading(item)}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                    className="block w-full truncate rounded-btn py-1.5 pr-2 text-left text-muted transition-colors hover:bg-surface hover:text-accent"
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>

        <span className="md-tool-sep" />

        {(["edit", "split", "preview"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-label={item === "edit" ? "编辑模式" : item === "split" ? "分屏模式" : "预览模式"}
            onClick={() => setMode(item)}
            className={cn("md-tool px-2", mode === item && "md-tool-active")}
          >
            {item === "edit" ? "编辑" : item === "split" ? "分屏" : "预览"}
          </button>
        ))}

        {mode !== "edit" && (
          <button
            type="button"
            aria-label={device === "phone" ? "切换为桌面宽度预览" : "切换为手机宽度预览"}
            title="手机预览：按读者在手机上看到的版心宽度排版"
            onClick={() => setDevice((prev) => (prev === "phone" ? "desktop" : "phone"))}
            className={cn("md-tool px-2", device === "phone" && "md-tool-active")}
          >
            {device === "phone" ? "手机" : "电脑"}
          </button>
        )}

        <button
          type="button"
          aria-label={immersive ? "退出全屏专注模式" : "进入全屏专注模式"}
          title={immersive ? "退出全屏（Esc）" : "全屏专注模式"}
          onClick={() => setImmersive((prev) => !prev)}
          className={cn("md-tool", immersive && "md-tool-active")}
        >
          {immersive ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </EditorToolbar>

      <div
        className={cn(
          "flex min-h-0",
          paneHeight,
          mode === "split" ? "flex-col md:flex-row" : "flex-col"
        )}
      >
        {mode !== "preview" && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">

            <textarea
              ref={textareaRef}
              id="md-editor"
              value={value}
              onChange={(event) => {
                // 连续输入合并成一个撤销点（见 pushSnapshot 的 coalesce 说明）
                pushSnapshot(value, true);
                onChange(event.target.value);
                requestAnimationFrame(syncSelection);
              }}
              onKeyDown={onKeyDown}
              onKeyUp={syncSelection}
              onClick={syncSelection}
              onSelect={syncSelection}
              onFocus={syncSelection}
              onPaste={onPaste}
              onScroll={() => syncScroll("editor")}
              spellCheck={false}
              aria-label="Markdown 正文"
              placeholder={
                "# 从这里开始写…\n\n支持 GFM 表格、任务列表、删除线、公式与 Mermaid；用 [[文章标题]] 建立双向链接。\n\n截图可直接 Ctrl/⌘+V 粘贴，图片文件也可以拖进来；从公众号或 Word 复制的富文本会自动转成 Markdown。"
              }
              className="min-h-0 flex-1 w-full resize-none border-0 bg-transparent p-5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted/70"
            />
          </div>
        )}

        {mode !== "edit" && (
          <PreviewPane
            ref={previewRef}
            preview={preview}
            source={value}
            device={device}
            onScroll={() => syncScroll("preview")}
            emptyHint="左侧开始写作，这里会按发布后的效果实时预览。"
            className={cn("min-w-0 flex-1", mode === "split" && "md:border-l md:border-border")}
          />
        )}
      </div>

      {wikiCandidates && (
        <div className="border-t border-border bg-card/95 px-3 py-2">
          <p className="mb-1 text-xs text-muted">
            双向链接候选（回车插入第一个，Esc 忽略）
          </p>
          <div className="flex flex-wrap gap-1.5">
            {wikiCandidates.items.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => acceptWiki(title)}
                className="chip text-xs"
              >
                [[{title}]]
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface/60 px-4 py-2 text-xs text-muted">
        <span title="不含空格与换行的字符数">{stats.charsNoSpace} 字</span>
        <span>段落 {stats.paragraphs}</span>
        <span>图片 {stats.images}</span>
        <span>链接 {stats.links}</span>
        <span title="中文按 400 字/分钟、英文按 220 词/分钟估算，与文章页显示的口径一致">
          约 {stats.minutes} 分钟读完
        </span>
        {knownTitles.length > 0 && wikiCount > 0 && (
          <span>
            双向链接 {wikiCount} 处
            {unresolved.length > 0 && (
              <span className="ml-1 text-warning">（{unresolved.length} 处目标不存在）</span>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {preview.pending ? (
            <span>预览渲染中…</span>
          ) : preview.degraded ? (
            <span className="text-warning">预览已降级为本地渲染</span>
          ) : (
            <span>预览与发布效果一致</span>
          )}
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="underline decoration-dotted underline-offset-4 hover:text-accent"
          >
            快捷键
          </button>
        </span>
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent-soft/80">
          <p className="text-sm font-medium text-accent">松开鼠标即可上传图片</p>
        </div>
      )}

      {shortcutsOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="键盘快捷键"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-md overflow-y-auto rounded-modal border border-border bg-card p-5 shadow-raised"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">键盘快捷键</h3>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                aria-label="关闭快捷键面板"
                className="md-tool"
              >
                关闭
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              {SHORTCUTS.map((item) => (
                <div key={item.keys} className="flex items-start justify-between gap-4">
                  <dt className="shrink-0 font-mono text-xs text-accent">{item.keys}</dt>
                  <dd className="text-right text-muted">{item.label}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted">
              未标注 Alt 的组合键与浏览器自带的 Ctrl/⌘+1~9（切换标签页）等快捷键冲突，
              因此标题层级改用 Ctrl/⌘+Alt 组合。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}