"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ActiveState, ListKind } from "@/lib/markdownEdit";
import { Popover } from "./Popover";
import {
  BulletListIcon,
  CodeBlockIcon,
  DividerIcon,
  EmojiIcon,
  ImageIcon,
  KeyboardIcon,
  LinkIcon,
  OrderedListIcon,
  QuoteIcon,
  RedoIcon,
  TableIcon,
  TaskListIcon,
  UndoIcon,
} from "./icons";

/**
 * 编辑器工具栏：对标公众号编辑页的「一排到底」操作区。
 *
 * 设计取舍：
 *   1. 分组用细分隔线而不是子菜单 —— 常用操作一律一次点击可达；
 *   2. 每个按钮同时给 title 与 aria-label：title 给鼠标用户看快捷键，
 *      aria-label 给读屏用户（移动端看不到 title，只有 aria-label 生效）；
 *   3. 会改变的按钮（撤销/重做、格式开关）带 disabled / aria-pressed 状态，
 *      不做「点了没反应也不说为什么」的按钮。
 */

export type InlineKind = "bold" | "italic" | "strike" | "code";

export type EditorToolbarProps = {
  active: ActiveState;
  canUndo: boolean;
  canRedo: boolean;
  uploading: boolean;
  onInline: (kind: InlineKind) => void;
  onHeading: (level: number) => void;
  onList: (kind: ListKind) => void;
  onQuote: () => void;
  onCodeBlock: (lang: string) => void;
  onDivider: () => void;
  onTable: (rows: number, cols: number) => void;
  onLink: (url: string) => void;
  onImage: (url: string, alt: string, caption: string) => void;
  onUploadFiles: (files: File[]) => void;
  onWiki: () => void;
  onEmoji: (char: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenShortcuts: () => void;
  /** 右侧插槽：模式切换 / 设备预览 / 沉浸模式等布局控件 */
  children?: ReactNode;
};

const CODE_LANGS = ["ts", "tsx", "js", "python", "bash", "json", "sql", "html", "css", "go", "java", "yaml", "mermaid"];
const EMOJIS = [
  "😀", "😄", "😊", "🙂", "😉", "😍", "🤔", "😅", "😂", "😭",
  "😴", "😮", "😎", "🙏", "👍", "👏", "💪", "🤝", "🎉", "✨",
  "🔥", "💡", "⭐", "🚀", "📌", "📝", "✅", "❌", "⚠️", "🎯",
  "📊", "🧠", "🐛", "🔧", "📚", "☕", "🍀", "🌙", "❤️", "💯",
];


function ToolButton({
  label,
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("md-tool", active && "md-tool-active")}
    >
      {children}
    </button>
  );
}

function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const rows = 6;
  const cols = 8;
  return (
    <div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 14px)` }}>
        {Array.from({ length: rows * cols }, (_, index) => {
          const row = Math.floor(index / cols) + 1;
          const col = (index % cols) + 1;
          const on = row <= hover.rows && col <= hover.cols;
          return (
            <button
              key={index}
              type="button"
              aria-label={`插入 ${row} 行 ${col} 列表格`}
              onMouseEnter={() => setHover({ rows: row, cols: col })}
              onFocus={() => setHover({ rows: row, cols: col })}
              onClick={() => onPick(row, col)}
              className={cn(
                "h-3.5 w-3.5 rounded-[3px] border transition-colors",
                on ? "border-accent bg-accent-soft" : "border-border bg-card hover:border-accent"
              )}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-xs text-muted">
        {hover.rows ? `${hover.rows} 行 × ${hover.cols} 列` : "选择表格尺寸"}
      </p>
    </div>
  );
}

export function EditorToolbar({
  active,
  canUndo,
  canRedo,
  uploading,
  onInline,
  onHeading,
  onList,
  onQuote,
  onCodeBlock,
  onDivider,
  onTable,
  onLink,
  onImage,
  onUploadFiles,
  onWiki,
  onEmoji,
  onUndo,
  onRedo,
  onOpenShortcuts,
  children,
}: EditorToolbarProps) {
  const [pop, setPop] = useState<"" | "table" | "emoji" | "link" | "image" | "code">("");
  // useCallback 保持引用稳定：弹层内部按 onClose 重挂 document 监听，
  // 每次渲染都换新函数会让监听器在每次输入时被摘掉再装上
  const close = useCallback(() => setPop(""), []);
  const toggle = (name: typeof pop) => setPop((prev) => (prev === name ? "" : name));

  const [linkUrl, setLinkUrl] = useState("https://");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [lang, setLang] = useState("ts");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface/60 px-2 py-1.5">
      <ToolButton
        label="撤销"
        title="撤销（Ctrl/⌘+Z）"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <UndoIcon />
      </ToolButton>
      <ToolButton
        label="重做"
        title="重做（Ctrl/⌘+Shift+Z）"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <RedoIcon />
      </ToolButton>

      <span className="md-tool-sep" />

      {[1, 2, 3].map((level) => (
        <ToolButton
          key={level}
          label={`${level} 级标题`}
          title={`${level} 级标题（Ctrl/⌘+Alt+${level}，再按一次取消）`}
          active={active.heading === level}
          onClick={() => onHeading(level)}
        >
          <span className="font-semibold">H{level}</span>
        </ToolButton>
      ))}

      <span className="md-tool-sep" />

      <ToolButton label="加粗" title="加粗（Ctrl/⌘+B）" active={active.marks.bold} onClick={() => onInline("bold")}>
        <span className="font-bold">B</span>
      </ToolButton>
      <ToolButton label="斜体" title="斜体（Ctrl/⌘+I）" active={active.marks.italic} onClick={() => onInline("italic")}>
        <span className="italic">I</span>
      </ToolButton>
      <ToolButton
        label="删除线"
        title="删除线（Ctrl/⌘+Shift+X）"
        active={active.marks.strike}
        onClick={() => onInline("strike")}
      >
        <span className="line-through">S</span>
      </ToolButton>
      <ToolButton
        label="行内代码"
        title="行内代码（Ctrl/⌘+Alt+E）"
        active={active.marks.code}
        onClick={() => onInline("code")}
      >
        <span className="font-mono text-[11px]">{"<>"}</span>
      </ToolButton>

      <span className="md-tool-sep" />

      <ToolButton
        label="无序列表"
        title="无序列表（Ctrl/⌘+Shift+8）"
        active={active.list === "ul"}
        onClick={() => onList("ul")}
      >
        <BulletListIcon />
      </ToolButton>
      <ToolButton
        label="有序列表"
        title="有序列表（Ctrl/⌘+Shift+7）"
        active={active.list === "ol"}
        onClick={() => onList("ol")}
      >
        <OrderedListIcon />
      </ToolButton>
      <ToolButton
        label="任务列表"
        title="任务列表（Ctrl/⌘+Shift+9）"
        active={active.list === "task"}
        onClick={() => onList("task")}
      >
        <TaskListIcon />
      </ToolButton>
      <ToolButton label="引用" title="引用（Ctrl/⌘+Shift+Q）" active={active.quote} onClick={onQuote}>
        <QuoteIcon />
      </ToolButton>

      <span className="md-tool-sep" />

      <div className="relative">
        <ToolButton
          label="代码块"
          title="代码块（Ctrl/⌘+Alt+C；可指定语言，如 ```python title=app.py）"
          active={active.fence}
          onClick={() => toggle("code")}
        >
          <CodeBlockIcon />
        </ToolButton>
        <Popover open={pop === "code"} onClose={close}>
          <div className="w-56 space-y-2">
            <label className="block text-xs text-muted">
              语言
              <input
                value={lang}
                onChange={(event) => setLang(event.target.value)}
                className="input mt-1 font-mono text-xs"
                placeholder="ts / python / bash"
                aria-label="代码块语言"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              {CODE_LANGS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLang(item)}
                  className={cn("chip px-2 py-0.5 text-[11px]", lang === item && "chip-active")}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary btn-sm w-full"
              onClick={() => {
                onCodeBlock(lang.trim());
                close();
              }}
            >
              插入代码块
            </button>
          </div>
        </Popover>
      </div>

      <ToolButton label="分割线" title="分割线" onClick={onDivider}>
        <DividerIcon />
      </ToolButton>

      <div className="relative">
        <ToolButton label="表格" title="表格" onClick={() => toggle("table")}>
          <TableIcon />
        </ToolButton>
        <Popover open={pop === "table"} onClose={close}>
          <TablePicker
            onPick={(rows, cols) => {
              onTable(rows, cols);
              close();
            }}
          />
        </Popover>
      </div>

      <span className="md-tool-sep" />

      <div className="relative">
        <ToolButton label="插入图片" title="插入图片：可上传文件，也可填图片地址" onClick={() => toggle("image")}>
          <ImageIcon />
        </ToolButton>
        <Popover open={pop === "image"} onClose={close}>
          <div className="w-72 space-y-2">
            <button
              type="button"
              className="btn-ghost btn-sm w-full"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "上传中…" : "上传本地图片（可多选）"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="选择要上传的图片"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) onUploadFiles(files);
                event.target.value = "";
                close();
              }}
            />
            <div className="text-center text-xs text-muted">或</div>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              className="input font-mono text-xs"
              placeholder="/media/xxx.png 或 https://…"
              aria-label="图片地址"
            />
            <input
              value={imageAlt}
              onChange={(event) => setImageAlt(event.target.value)}
              className="input text-xs"
              placeholder="图片说明（alt，给读屏与搜索引擎）"
              aria-label="图片说明"
            />
            <input
              value={imageCaption}
              onChange={(event) => setImageCaption(event.target.value)}
              className="input text-xs"
              placeholder="图注（可选，显示在图片下方）"
              aria-label="图片图注"
            />
            <button
              type="button"
              className="btn-primary btn-sm w-full"
              disabled={!imageUrl.trim()}
              onClick={() => {
                onImage(imageUrl.trim(), imageAlt.trim() || "图片", imageCaption.trim());
                setImageUrl("");
                setImageAlt("");
                setImageCaption("");
                close();
              }}
            >
              插入图片
            </button>
          </div>
        </Popover>
      </div>

      <div className="relative">
        <ToolButton label="插入链接" title="插入链接（Ctrl/⌘+K）" onClick={() => toggle("link")}>
          <LinkIcon />
        </ToolButton>
        <Popover open={pop === "link"} onClose={close}>
          <div className="w-64 space-y-2">
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              className="input font-mono text-xs"
              placeholder="https://example.com"
              aria-label="链接地址"
              autoFocus
            />
            <p className="text-xs text-muted">
              选中文字后再点链接，可直接把选中内容变成链接文字。
            </p>
            <button
              type="button"
              className="btn-primary btn-sm w-full"
              disabled={!linkUrl.trim() || linkUrl.trim() === "https://"}
              onClick={() => {
                onLink(linkUrl.trim());
                close();
              }}
            >
              插入链接
            </button>
          </div>
        </Popover>
      </div>

      <ToolButton
        label="双向链接"
        title="双向链接 [[文章标题]]：保存后自动出现在数字花园与被引用文章的反向链接里"
        onClick={onWiki}
      >
        <span className="font-mono text-[11px]">[[ ]]</span>
      </ToolButton>

      <div className="relative">
        <ToolButton label="表情" title="插入表情符号" onClick={() => toggle("emoji")}>
          <EmojiIcon />
        </ToolButton>
        <Popover open={pop === "emoji"} onClose={close}>
          <div className="grid w-56 grid-cols-8 gap-0.5">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`插入表情 ${emoji}`}
                onClick={() => {
                  onEmoji(emoji);
                  close();
                }}
                className="rounded-btn p-1 text-base leading-none transition-colors hover:bg-surface"
              >
                {emoji}
              </button>
            ))}
          </div>
        </Popover>
      </div>

      <span className="md-tool-sep" />

      <ToolButton label="键盘快捷键" title="查看全部快捷键" onClick={onOpenShortcuts}>
        <KeyboardIcon />
      </ToolButton>

      <div className="ml-auto flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}