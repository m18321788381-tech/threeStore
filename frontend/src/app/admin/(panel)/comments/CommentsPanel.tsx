"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import { formatDateTime } from "@/lib/utils";
import type { Paginated, AdminComment } from "@/types";

const STATUS: Record<number, { label: string; className: string }> = {
  0: { label: "待审", className: "badge badge-warning" },
  1: { label: "已通过", className: "badge badge-success" },
  2: { label: "已驳回", className: "badge badge-error" },
  3: { label: "垃圾", className: "badge badge-muted" },
};

export function CommentsPanel() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<number | undefined>(0);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: "待审", value: 0 },
          { label: "已通过", value: 1 },
          { label: "已驳回", value: 2 },
          { label: "垃圾", value: 3 },
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
        <button
          type="button"
          onClick={() => {
            setStatus(undefined);
            setPage(1);
          }}
          className={`chip ${status === undefined ? "border-accent bg-accent-soft text-accent" : ""}`}
        >
          全部
        </button>
        <span className="ml-auto text-xs text-muted">共 {result.total} 条</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState title="没有符合条件的评论" />
      ) : (
        <ul className="space-y-3">
          {result.items.map((c) => {
            const meta = STATUS[c.status] || STATUS[0];
            return (
              <li key={c.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{c.author_name}</span>
                  {c.is_author && (
                    <span className="badge badge-accent">
                      作者
                    </span>
                  )}
                  <span className={meta.className}>
                    {meta.label}
                  </span>
                  {c.is_pinned && (
                    <span className="badge badge-muted">
                      置顶
                    </span>
                  )}
                  <span className="text-muted">{formatDateTime(c.created_at)}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted">
                    {c.ip_address}
                  </span>
                </div>

                <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {c.content}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Link
                    href={`/posts/${c.post_slug}`}
                    className="text-muted hover:text-accent"
                  >
                    → {c.post_title}
                  </Link>

                  <div className="ml-auto flex items-center gap-2">
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

      {result.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="chip h-8 disabled:opacity-50"
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
            className="chip h-8 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
