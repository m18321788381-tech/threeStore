"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { siteConfig } from "@/lib/site";

type Line = { kind: "input" | "output" | "error"; text: string };

const HISTORY_KEY = "blog_terminal_history";
const BANNER: Line[] = [
  { kind: "output", text: `Welcome to ${siteConfig.title} — type 'help' 查看可用命令` },
  { kind: "output", text: "提示：↑↓ 翻阅历史，Esc 关闭面板" },
];

export function TerminalEgg() {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(BANNER);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [hintDismissed, setHintDismissed] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const postsRef = useRef<Array<{ slug: string; title: string }>>([]);

  /* ---------------- 快捷键：Ctrl+K / ⌘K 唤起，Esc 关闭 ---------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (typing) return; // 不劫持输入框内的 Ctrl+K
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---------------- 首次访问的一次性提示 ---------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem("blog_terminal_hint");
    if (!seen) setHintDismissed(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw) {
      try {
        setHistory(JSON.parse(raw).slice(-50));
      } catch {
        /* 忽略脏数据 */
      }
    }
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines]);

  const push = useCallback((text: string, kind: Line["kind"] = "output") => {
    setLines((prev) => [...prev, { kind, text }]);
  }, []);

  const ensurePosts = useCallback(async (): Promise<Array<{ slug: string; title: string }>> => {
    if (postsRef.current.length) return postsRef.current;
    try {
      const res = await fetch("/api/v1/posts?page=1&page_size=100");
      const json = await res.json();
      const items = (json?.data?.items || []).map((p: { slug: string; title: string }) => ({
        slug: p.slug,
        title: p.title,
      }));
      postsRef.current = items;
      return items;
    } catch {
      return [];
    }
  }, []);

  const run = useCallback(
    async (raw: string) => {
      const cmd = raw.trim();
      if (!cmd) return;

      setLines((prev) => [...prev, { kind: "input", text: cmd }]);
      setHistory((prev) => {
        const next = [...prev, cmd].slice(-50);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        }
        return next;
      });
      setHistoryIndex(-1);

      const [name, ...args] = cmd.split(/\s+/);
      const arg = args.join(" ");

      switch (name.toLowerCase()) {
        case "help":
          push("可用命令：");
          push("  help              显示本帮助");
          push("  ls [posts|about|garden]   列出内容");
          push("  cd <路径>         跳转路由，如 cd /archive");
          push("  cat about         查看关于页摘要");
          push("  open github       打开外链");
          push("  theme dark|light|toggle   切换主题");
          push("  whoami            博主简介");
          push("  date / uname -a   系统信息");
          push("  clear             清屏");
          push("  exit              关闭终端");
          break;

        case "ls": {
          if (arg === "posts" || arg === "") {
            const posts = await ensurePosts();
            if (!posts.length) push("（暂无文章，或后端未连接）", "error");
            else posts.forEach((p) => push(`  ${p.slug}    ${p.title}`));
          } else if (arg === "about") {
            push("  about.md  now.md  resume.md");
          } else if (arg === "garden") {
            push("  /garden — 双向链接图谱");
          } else {
            push(`ls: ${arg}: No such file or directory`, "error");
          }
          break;
        }

        case "cd": {
          if (!arg) {
            push("cd: 缺少路径", "error");
            break;
          }
          const path = arg.startsWith("/") ? arg : `/${arg}`;
          router.push(path === "/posts" ? "/archive" : path);
          push(`→ ${path}`);
          setOpen(false);
          break;
        }

        case "cat":
          if (arg === "about") {
            push(siteConfig.bio);
          } else if (arg === "now") {
            push("正在写这个博客。偶尔发呆。");
          } else {
            push(`cat: ${arg || "(空)"}: No such file or directory`, "error");
          }
          break;

        case "open":
          if (arg === "github" || arg === "gh") {
            window.open(siteConfig.social[0]?.href || "https://github.com", "_blank");
            push("已在新标签打开 GitHub");
          } else if (arg.startsWith("http")) {
            window.open(arg, "_blank");
            push(`已打开 ${arg}`);
          } else {
            push("用法：open github | open https://…", "error");
          }
          break;

        case "theme":
          if (arg === "toggle") setTheme(resolvedTheme === "dark" ? "light" : "dark");
          else if (arg === "dark" || arg === "light") setTheme(arg);
          else push("用法：theme dark | light | toggle", "error");
          if (["dark", "light", "toggle"].includes(arg)) push(`主题已切换：${arg}`);
          break;

        case "whoami":
          push(`${siteConfig.author} — ${siteConfig.bio}`);
          break;

        case "date":
          push(new Date().toString());
          break;

        case "uname":
          push(`${siteConfig.title} 1.0.0 (next.js; fastapi; postgres) ${navigator.platform}`);
          break;

        case "sudo":
          if (arg.startsWith("rm")) {
            push("Permission denied. Nice try. 🧹");
          } else {
            push(`${siteConfig.author} is not in the sudoers file. This incident will be reported.`);
          }
          break;

        case "clear":
          setLines([]);
          break;

        case "exit":
          setOpen(false);
          break;

        default:
          push(`command not found: ${name}`, "error");
          push("输入 help 查看可用命令");
      }
    },
    [ensurePosts, push, resolvedTheme, router, setTheme]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const value = input;
      setInput("");
      void run(value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setInput(history[next] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < 0) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setInput("");
      } else {
        setHistoryIndex(next);
        setInput(history[next] || "");
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <>
      {!hintDismissed && !open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setHintDismissed(true);
            window.localStorage.setItem("blog_terminal_hint", "1");
          }}
          className="fixed bottom-5 right-5 z-40 rounded-full border border-border bg-background px-4 py-2 text-xs shadow-lg transition-colors hover:border-accent hover:text-accent"
        >
          按 Ctrl+K 试试 ✨
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="终端"
          className="fixed inset-x-0 bottom-0 z-50 h-[60vh] terminal-panel border-t border-border shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs">
            <span className="opacity-70">
              {siteConfig.title} — tty1
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭终端"
              className="ml-auto rounded px-2 py-0.5 opacity-70 hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          <div
            ref={outputRef}
            className="h-[calc(100%-76px)] overflow-y-auto px-4 py-3 text-[13px] leading-relaxed"
          >
            {lines.map((line, i) => (
              <div
                key={i}
                className={
                  line.kind === "input"
                    ? "opacity-90"
                    : line.kind === "error"
                      ? "text-error"
                      : "opacity-80"
                }
              >
                {line.kind === "input" ? (
                  <>
                    <span className="opacity-60">user@blog:~$</span> {line.text}
                  </>
                ) : (
                  <span className="whitespace-pre-wrap">{line.text}</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2">
            <span className="text-[13px] opacity-60">user@blog:~$</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 bg-transparent text-[13px] outline-none"
              aria-label="终端命令输入"
              spellCheck={false}
            />
            <span className="terminal-cursor" aria-hidden />
          </div>
        </div>
      )}
    </>
  );
}
