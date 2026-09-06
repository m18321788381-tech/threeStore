"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { formatDate } from "@/lib/utils";
import type { Paginated, PostListItem } from "@/types";

const STATUS_LABEL: Record<number, string> = { 0: "草稿", 1: "已发布", 2: "归档" };

export function PostsTable() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-posts", status, page],
    queryFn: () =>
      api.posts({ page, page_size: 15, ...(status !== undefined ? { status } : {}) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deletePost(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-posts"] }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, next }: { id: string; next: number }) =>
      api.publishPost(id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-posts"] }),
  });

  const result = (data || { items: [], pages: 0, total: 0 }) as Paginated<PostListItem>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "全部", value: undefined },
          { label: "已发布", value: 1 },
          { label: "草稿", value: 0 },
          { label: "归档", value: 2 },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setStatus(item.value);
              setPage(1);
            }}
            className={`chip ${status === item.value ? "border-accent bg-accent-soft text-accent" : ""}`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">共 {result.total} 篇</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState title="没有符合条件的文章" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/70 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">标题</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">阅读</th>
                <th className="px-4 py-3 font-medium">更新</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.items.map((post) => (
                <tr key={post.id} className="hover:bg-surface/50">
                  <td className="max-w-[280px] px-4 py-3">
                    <Link
                      href={`/admin/posts/${post.id}/edit`}
                      className="line-clamp-1 font-medium hover:text-accent"
                    >
                      {post.title}
                    </Link>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted">
                      /{post.slug}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{post.category?.name || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        post.status === 1
                          ? "bg-green-500/10 text-green-600"
                          : "bg-accent-soft text-accent"
                      }`}
                    >
                      {STATUS_LABEL[post.status] ?? "未知"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{post.view_count}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(post.updated_at || post.published_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <button
                        type="button"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({ id: post.id, next: post.status === 1 ? 0 : 1 })
                        }
                        className="rounded border border-border px-2 py-1 text-muted hover:border-accent hover:text-accent"
                      >
                        {post.status === 1 ? "转为草稿" : "发布"}
                      </button>
                      <Link
                        href={`/admin/posts/${post.id}/edit`}
                        className="rounded border border-border px-2 py-1 text-muted hover:border-accent hover:text-accent"
                      >
                        编辑
                      </Link>
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`确定删除《${post.title}》？此操作不可撤销。`)) {
                            remove.mutate(post.id);
                          }
                        }}
                        className="rounded border border-border px-2 py-1 text-red-500 hover:border-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="chip disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm text-muted">
            {page} / {result.pages}
          </span>
          <button
            type="button"
            disabled={page >= result.pages}
            onClick={() => setPage((p) => p + 1)}
            className="chip disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
