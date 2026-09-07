"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { TablePager } from "@/components/common/TablePager";
import { cn, formatDate } from "@/lib/utils";
import type { Paginated, PostListItem } from "@/types";

const STATUS_LABEL: Record<number, string> = { 0: "草稿", 1: "已发布", 2: "归档" };
const STATUS_BADGE: Record<number, string> = {
  0: "badge-warning",
  1: "badge-success",
  2: "badge-muted",
};

const FILTERS: Array<{ label: string; value: number | undefined }> = [
  { label: "全部", value: undefined },
  { label: "已发布", value: 1 },
  { label: "草稿", value: 0 },
  { label: "归档", value: 2 },
];

export function PostsTable({ initialStatus }: { initialStatus?: number }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<number | undefined>(initialStatus);
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
    mutationFn: ({ id, next }: { id: string; next: number }) => api.publishPost(id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-posts"] }),
  });

  const result = (data || { items: [], pages: 0, total: 0, page: 1, page_size: 15 }) as Paginated<
    PostListItem
  >;

  return (
    <div className="space-y-5">
      <div className="toolbar">
        {FILTERS.map((item) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={status === item.value}
            onClick={() => {
              setStatus(item.value);
              setPage(1);
            }}
            className={cn("chip cursor-pointer", status === item.value && "chip-active")}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto text-meta tabular-nums text-muted">共 {result.total} 篇</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState title="没有符合条件的文章" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>标题</th>
                <th className="w-28">分类</th>
                <th className="w-20">状态</th>
                <th className="w-16 text-right">阅读</th>
                <th className="w-24">更新</th>
                <th className="w-44 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((post) => (
                <tr key={post.id} className="transition-colors hover:bg-surface">
                  <td className="max-w-[320px]">
                    <Link
                      href={`/admin/posts/${post.id}/edit`}
                      className="line-clamp-1 font-medium transition-colors hover:text-accent"
                    >
                      {post.title}
                    </Link>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                      /{post.slug}
                    </span>
                  </td>
                  <td className="text-muted">{post.category?.name || "—"}</td>
                  <td>
                    <span className={STATUS_BADGE[post.status] ?? "badge-muted"}>
                      {STATUS_LABEL[post.status] ?? "未知"}
                    </span>
                  </td>
                  <td className="text-right tabular-nums text-muted">{post.view_count}</td>
                  <td className="whitespace-nowrap text-meta text-muted">
                    {formatDate(post.updated_at || post.published_at)}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5 text-xs">
                      <button
                        type="button"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({ id: post.id, next: post.status === 1 ? 0 : 1 })
                        }
                        className="row-action"
                      >
                        {post.status === 1 ? "转草稿" : "发布"}
                      </button>
                      <Link href={`/admin/posts/${post.id}/edit`} className="row-action">
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
                        className="row-action-danger"
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

      <TablePager page={result.page} pages={result.pages} onChange={setPage} />
    </div>
  );
}
