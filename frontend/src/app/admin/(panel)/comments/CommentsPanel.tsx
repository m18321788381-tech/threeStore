"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { TablePager } from "@/components/common/TablePager";
import { cn, formatDateTime } from "@/lib/utils";
import type { Paginated, AdminComment } from "@/types";

const STATUS: Record<number, { label: string; className: string }> = {
  0: { label: "待审", className: "badge-warning" },
  1: { label: "已通过", className: "badge-success" },
  2: { label: "已驳回", className: "badge-error" },
  3: { label: "垃圾", className: "badge-muted" },
};

const FILTERS: Array<{ label: string; value: number | undefined }> = [
  { label: "待审", value: 0 },
  { label: "已通过", value: 1 },
  { label: "已驳回", value: 2 },
  { label: "垃圾", value: 3 },
  { label: "全部", value: undefined },
];

export function CommentsPanel({ initialStatus }: { initialStatus?: number }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<number | undefined>(
    initialStatus === undefined ? 0 : initialStatus
  );
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-comments", status, page],
    queryFn: () => api.adminComments({ page, page_size: 20, status }),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.updateComment(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-comments"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const result: Paginated<AdminComment> =
    data ||
    ({ page: 1, page_size: 20, items: [], pages: 0, total: 0 } as Paginated<AdminComment>);

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
        <span className="ml-auto text-meta tabular-nums text-muted">共 {result.total} 条</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState title="没有符合条件的评论" description="切换上面的筛选状态试试。" />
      ) : (
        <ul className="space-y-3">
          {result.items.map((c) => {
            const meta = STATUS[c.status] ?? STATUS[0];
            return (
              <li key={c.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-meta">
                  <span className="font-semibold text-foreground">{c.author_name}</span>
                  {c.is_author && <span className="author-badge">作者</span>}
                  <span className={meta.className}>{meta.label}</span>
                  {c.is_pinned && <span className="badge badge-muted">置顶</span>}
                  <time className="ml-auto whitespace-nowrap text-muted tabular-nums">
                    {formatDateTime(c.created_at)}
                  </time>
                  <span className="whitespace-nowrap font-mono text-[11px] text-muted">
                    {c.ip_address}
                  </span>
                </div>

                <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {c.content}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Link
                    href={`/posts/${c.post_slug}`}
                    className="min-w-0 truncate text-meta text-muted transition-colors hover:text-accent"
                  >
                    → {c.post_title}
                  </Link>

                  <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                    {c.status !== 1 && (
                      <button
                        type="button"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: c.id, body: { status: 1 } })}
                        className="row-action"
                      >
                        通过
                      </button>
                    )}
                    {c.status !== 2 && (
                      <button
                        type="button"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: c.id, body: { status: 2 } })}
                        className="row-action"
                      >
                        驳回
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({ id: c.id, body: { is_pinned: !c.is_pinned } })
                      }
                      className="row-action"
                    >
                      {c.is_pinned ? "取消置顶" : "置顶"}
                    </button>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("确定删除这条评论？其回复也会一并删除。")) {
                          remove.mutate(c.id);
                        }
                      }}
                      className="row-action-danger"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TablePager page={result.page} pages={result.pages} onChange={setPage} />
    </div>
  );
}
