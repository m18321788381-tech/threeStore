"use client";

import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** 已有文章标题，用于 [[自动补全]] 提示 */
  knownTitles?: string[];
  onUpload?: (file: File) => Promise<string | null>;
};

const TOOLBAR = [
  { label: "H2", wrap: ["\n## ", "\n"], hint: "二级标题" },
  { label: "粗体", wrap: ["**", "**"], hint: "加粗（Ctrl/⌘+B）" },
  { label: "斜体", wrap: ["*", "*"], hint: "斜体（Ctrl/⌘+I）" },
  { label: "代码", wrap: ["\n```ts\n", "\n```\n"], hint: "代码块" },
  { label: "引用", wrap: ["\n> ", "\n"], hint: "引用" },
  { label: "链接", wrap: ["[", "](https://)"], hint: "链接（Ctrl/⌘+K）" },
  { label: "图片", wrap: ["![alt](", ")"], hint: "图片" },
  { label: "[[链接]]", wrap: ["[[", "]]"], hint: "双向链接" },
  { label: "表格", wrap: ["\n| 列 A | 列 B |\n| --- | --- |\n|  |  |\n", ""], hint: "GFM 表格" },
  { label: "任务", wrap: ["\n- [ ] ", "\n"], hint: "任务列表" },
];

/** 编辑器快捷键：只做最常用的三个，避免与浏览器/系统快捷键打架。 */
const SHORTCUTS: Record<string, [string, string]> = {
  b: ["**", "**"],
  i: ["*", "*"],
  k: ["[", "](https://)"],
};

export function MarkdownEditor({ value, onChange, knownTitles = [], onUpload }: Props) {
  const [mode, setMode] = useState<"split" | "edit" | "preview">("split");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 用 ref 而非 document.getElementById：分屏/预览切换会卸载重建 textarea，
  // 全局 id 取值可能拿到 null 或过期节点，表现为「工具栏点了没反应」的偶发问题。
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stats = useMemo(() => {
    const text = value || "";
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
    return {
      chars: text.length,
      minutes: Math.max(1, Math.round(cjk / 400 + words / 220)),
    };
  }, [value]);

  // 提取正文里的 [[...]]，并把未匹配的标记为待创建
  const wikiTargets = useMemo(() => {
    const found = Array.from((value || "").matchAll(/\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g));
    return found.map((m) => ({
      target: m[1].trim(),
      exists: knownTitles.some(
        (t) => t.toLowerCase() === m[1].trim().toLowerCase()
      ),
    }));
  }, [value, knownTitles]);

  const applyWrap = (before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + selected.length;
    });
  };

  /**
   * 批量插入图片（文件选择器 / 粘贴截图 / 拖拽共用同一条路径）。
   *
   * 为什么在这里自己累积 buffer 与 cursor，而不是每轮重新读 value：
   * 多张图是「上传一张 → onChange 一次」的串行流程，第二轮进循环时 props 里的
   * value 仍是上一轮渲染的旧值（React 状态尚未回流），直接拿它切片会把前一张图的
   * 结果整段覆盖掉。自己累积则天然串行正确。
   */
  const handleFiles = async (files: File[]) => {
    if (!onUpload) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;

    setUploading(true);
    let buffer = value;
    let cursor = textareaRef.current?.selectionStart ?? value.length;
    try {
      for (const file of images) {
        const url = await onUpload(file);
        // 单张失败（超出体积上限、类型不符）不该中断其余图片的上传
        if (!url) continue;
        const snippet = `\n![${file.name}](${url})\n`;
        buffer = buffer.slice(0, cursor) + snippet + buffer.slice(cursor);
        cursor += snippet.length;
        onChange(buffer);
      }
    } finally {
      setUploading(false);
      // 光标落到最后一张图之后，方便接着写图注
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.selectionStart = cursor;
        el.selectionEnd = cursor;
      });
    }
  };

  /** 粘贴截图：截图工具里 Ctrl+V 直接落库，省掉「先存盘再选文件」 */
  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onUpload) return;
    const images = Array.from(event.clipboardData?.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (!images.length) return;
    // 不拦截的话，部分环境会把文件当纯文本处理，往正文里插一行 "image.png"
    event.preventDefault();
    void handleFiles(images);
  };

  /** dragover 阶段拿不到 File 对象，只能靠 types 判断是否携带文件 */
  const carriesFiles = (event: React.DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer?.types || []).includes("Files");

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
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.some((f) => f.type.startsWith("image/"))) {
      setDragging(false);
      return;
    }
    event.preventDefault();
    setDragging(false);
    void handleFiles(files);
  };

  const unresolved = wikiTargets.filter((w) => !w.exists);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const pair = SHORTCUTS[event.key.toLowerCase()];
    if (!pair) return;
    event.preventDefault();
    applyWrap(pair[0], pair[1]);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-panel border transition-colors",
        dragging ? "border-accent" : "border-border"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface/60 px-2 py-1.5">
        {TOOLBAR.map((item) => (
          <button
            key={item.label}
            type="button"
            title={item.hint}
            onClick={() => applyWrap(item.wrap[0], item.wrap[1])}
            className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-background hover:text-accent"
          >
            {item.label}
          </button>
        ))}

        {onUpload && (
          <label
            title="也可以直接把图片文件拖进来，或 Ctrl/⌘+V 粘贴截图"
            className="ml-1 cursor-pointer rounded px-2 py-1 text-xs text-muted hover:bg-background hover:text-accent"
          >
            {uploading ? "上传中…" : "插入图片"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) void handleFiles(files);
                e.target.value = "";
              }}
            />
          </label>
        )}

        <div className="ml-auto flex items-center gap-1">
          {(["edit", "split", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                mode === m ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
              )}
            >
              {m === "edit" ? "编辑" : m === "split" ? "分屏" : "预览"}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid", mode === "split" ? "md:grid-cols-2" : "grid-cols-1")}>
        {mode !== "preview" && (
          <textarea
            ref={textareaRef}
            id="md-editor"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            spellCheck={false}
            placeholder="# 从这里开始写…&#10;&#10;支持 GFM 表格、任务列表、删除线；用 [[文章标题]] 建立双向链接。&#10;&#10;截图可直接 Ctrl/⌘+V 粘贴，图片文件也可以拖进来。"
            className="h-[620px] w-full resize-none border-0 bg-transparent p-5 font-mono text-[13px] leading-relaxed md:border-r md:border-border"
          />
        )}

        {mode !== "edit" && (
          <div className="h-[620px] overflow-y-auto p-5">
            {value.trim() ? (
              <div className="prose-blog">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSlug, rehypeHighlight]}
                >
                  {value}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted">左侧开始写作，这里会实时预览。</p>
            )}
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border bg-surface/60 px-4 py-2 text-xs text-muted">
        <span>{stats.chars} 字</span>
        <span>约 {stats.minutes} 分钟读完</span>
        <span className="ml-auto flex items-center gap-2">
          {wikiTargets.length > 0 && (
            <span>
              双向链接 {wikiTargets.length} 处
              {unresolved.length > 0 && (
                <span className="ml-1 text-warning">
                  （{unresolved.length} 处目标不存在）
                </span>
              )}
            </span>
          )}
        </span>
      </div>

      {/* 拖拽遮罩：pointer-events-none 让 drop 事件仍落在容器上 */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-accent-soft/80">
          <p className="text-sm font-medium text-accent">松开鼠标即可上传图片</p>
        </div>
      )}
    </div>
  );
}
