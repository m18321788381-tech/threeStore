"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import type { MediaItem, Paginated } from "@/types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 替代文本（alt）行内编辑。
 *
 * 之所以要维护在媒体库而不是只在写文章时填：
 *   同一张图常被多篇文章复用，正文里写 `![](/media/x.png)` 会产出**空 alt**；
 *   服务端渲染时会用这里维护的值兜底补上（见后端 inject_image_dimensions），
 *   于是一次填写惠及所有引用处，也让读屏软件与图片搜索有内容可用。
 */
function AltEditor({ item, onSaved }: { item: MediaItem; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.alt || "");

  const save = useMutation({
    mutationFn: () => api.updateMedia(item.id, { alt: value }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(item.alt || "");
          setEditing(true);
        }}
        className="block w-full truncate text-left text-[11px] text-muted transition-colors hover:text-accent"
        title={item.alt || "点击添加"}
      >
        {item.alt ? `alt：${item.alt}` : "＋ 添加替代文本"}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex items-center gap-1.5"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="描述这张图"
        aria-label="图片替代文本"
        className="input px-2 py-1 text-[11px]"
      />
      <button
        type="submit"
        disabled={save.isPending}
        className="row-action shrink-0 text-[11px]"
      >
        保存
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="row-action shrink-0 text-[11px]"
      >
        取消
      </button>
    </form>
  );
}

export function MediaPanel() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => api.media(1, 60),
  });

  const upload = useMutation({
    mutationFn: (form: FormData) => api.upload(form),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMedia(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media"] }),
  });

  const result = (data || { items: [], total: 0 }) as Paginated<MediaItem>;

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-center justify-center rounded-panel border border-dashed border-border px-6 py-10 text-center transition-colors hover:border-accent">
        <span>
          <span className="block text-sm font-medium">点击上传图片</span>
          <span className="mt-1 block text-xs text-muted">
            JPG / PNG / GIF / WebP / SVG，≤ 10MB
            {upload.isPending && " · 上传中…"}
          </span>
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const form = new FormData();
              form.append("file", file);
              upload.mutate(form);
            }
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="text-sm text-error">{error}</p>}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState title="还没有上传任何图片" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {result.items.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              {/* 媒体由 Nginx / Next 反代同源提供，直接用 img 即可 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt || item.filename}
                loading="lazy"
                decoding="async"
                className="h-32 w-full bg-surface object-contain"
              />
              <div className="space-y-2 p-3">
                <p className="truncate font-mono text-[11px] text-muted" title={item.url}>
                  {item.url}
                </p>
                <p className="text-[11px] text-muted tabular-nums">
                  {formatSize(item.size)}
                  {item.width > 0 && item.height > 0 && (
                    <>
                      {" · "}
                      {item.width} × {item.height}
                    </>
                  )}
                </p>
                <AltEditor
                  item={item}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ["media"] })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      // 使用带降级的复制工具：Clipboard API 仅在 HTTPS / localhost
                      // 可用，HTTP 站点需要走临时 textarea 兜底
                      const ok = await copyToClipboard(item.url);
                      if (ok) {
                        setError("");
                        setCopied(item.id);
                        setTimeout(() => setCopied(""), 1500);
                      } else {
                        setError("复制失败，请手动复制链接");
                      }
                    }}
                    className="row-action text-[11px]"
                  >
                    {copied === item.id ? "已复制" : "复制链接"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("删除这张图片？")) remove.mutate(item.id);
                    }}
                    className="row-action-danger text-[11px]"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
