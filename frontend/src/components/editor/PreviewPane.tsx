"use client";

import { forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { PostContent } from "@/components/post/PostContent";
import { cn } from "@/lib/utils";

export type PreviewState = {
  /** 后端渲染结果：与发布落库的 content_html 同一条管线 */
  html: string;
  /** 后端预览不可用，已降级为本地渲染 */
  degraded: boolean;
  /** 请求在途 */
  pending: boolean;
};

/**
 * 预览面板。
 *
 * 为什么优先用后端返回的 HTML 而不是本地 react-markdown：
 *   本地渲染与服务端保存时的渲染是两套实现（highlight.js vs Pygments、
 *   无图注、无图片尺寸注入、[[链接]] 形态不同），作者会在预览里看到
 *   「和发布后不一样」的正文。这里直接渲染后端返回的同一份 HTML，
 *   并用与文章页相同的 PostContent 挂增强（代码块标题栏、Mermaid、KaTeX、
 *   图片灯箱）—— 预览即最终效果。
 *
 * 降级路径保留本地渲染：后端不可用时作者至少能看到排版结构，
 * 面板上会明确标注「已降级」，不假装一致。
 */
export const PreviewPane = forwardRef<
  HTMLDivElement,
  {
    preview: PreviewState;
    source: string;
    device: "desktop" | "phone";
    emptyHint?: string;
    className?: string;
    onScroll?: () => void;
  }
>(function PreviewPane({ preview, source, device, emptyHint, className, onScroll }, ref) {
  const hasContent = Boolean(preview.html) || Boolean(source.trim());

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={cn("min-h-0 overflow-y-auto p-5", className)}
      data-preview-device={device}
    >
      {preview.html ? (
        <div className={cn(device === "phone" && "md-phone")}>
          <PostContent html={preview.html} />
        </div>
      ) : hasContent ? (
        <div className={cn("prose-blog", device === "phone" && "md-phone")}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug, rehypeHighlight]}>
            {source}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted">{emptyHint ?? "左侧开始写作，这里会实时预览。"}</p>
      )}

      {preview.degraded && (
        <p className="mt-4 rounded-btn border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
          预览服务暂不可用，已降级为本地渲染：代码高亮配色、图片图注与站内链接形态可能与发布效果略有差异。
        </p>
      )}
    </div>
  );
});