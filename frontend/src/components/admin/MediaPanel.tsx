"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import type { MediaItem, Paginated } from "@/types";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
                alt={item.filename}
                className="h-32 w-full bg-surface object-contain"
              />
              <div className="space-y-2 p-3">
                <p className="truncate font-mono text-[11px] text-muted" title={item.url}>
                  {item.url}
                </p>
                <p className="text-[11px] text-muted">{formatSize(item.size)}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.url);
                      setCopied(item.id);
                      setTimeout(() => setCopied(""), 1500);
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
