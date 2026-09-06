"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CommentNode, Paginated } from "@/types";
import { cn, formatDateTime, initials } from "@/lib/utils";

const PAGE_SIZE = 20;

function CommentForm({
  slug,
  parentId,
  onDone,
  compact = false,
}: {
  slug: string;
  parentId?: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.createComment(slug, {
        author_name: name.trim() || "匿名访客",
        author_site: site.trim() || null,
        content: content.trim(),
        parent_id: parentId || null,
      }),
    onSuccess: () => {
      setContent("");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["comments", slug] });
      onDone?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (content.trim().length < 2) {
          setError("至少写两个字吧");
          return;
        }
        mutation.mutate();
      }}
      className={cn("rounded-xl border border-border p-4", compact && "bg-surface/50")}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="昵称（选填）"
          maxLength={50}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          value={site}
          onChange={(e) => setSite(e.target.value)}
          placeholder="个人站点（选填）"
          maxLength={255}
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="说点什么…（支持纯文本，提交后需博主审核）"
        rows={compact ? 3 : 4}
        maxLength={2000}
        className="mt-2 w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn-primary !py-1.5"
        >
          {mutation.isPending ? "提交中…" : parentId ? "回复" : "发表评论"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm text-muted hover:text-foreground">
            取消
          </button>
        )}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  slug,
  depth = 0,
}: {
  comment: CommentNode;
  slug: string;
  depth?: number;
}) {
  const [replying, setReplying] = useState(false);

  return (
    <li className="mt-5 first:mt-0">
      <div className="flex gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-medium",
            comment.is_author ? "bg-accent text-white" : "border border-border text-muted"
          )}
        >
          {initials(comment.author_name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{comment.author_name}</span>
            {comment.is_author && (
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">
                作者
              </span>
            )}
            {comment.is_pinned && (
              <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
                置顶
              </span>
            )}
            <span className="text-xs text-muted">
              {formatDateTime(comment.created_at)}
            </span>
          </div>

          <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {comment.content}
          </p>

          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            className="mt-2 text-xs text-muted hover:text-accent"
          >
            {replying ? "收起" : "回复"}
          </button>

          {replying && (
            <div className="mt-3">
              <CommentForm
                slug={slug}
                parentId={comment.id}
                compact
                onDone={() => setReplying(false)}
              />
            </div>
          )}

          {comment.replies.length > 0 && (
            <ul className="mt-4 border-l border-border pl-4">
              {comment.replies.map((child) => (
                <CommentItem
                  key={child.id}
                  comment={child}
                  slug={slug}
                  depth={depth + 1}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function CommentSection({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["comments", slug, page],
    queryFn: () => api.comments(slug, page, PAGE_SIZE),
  });

  const result = (data || { items: [], total: 0, pages: 0 }) as Paginated<CommentNode>;

  return (
    <section id="comments" className="mt-16 border-t border-border pt-10">
      <h2 className="text-lg font-semibold">
        评论
        {result.total > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">
            共 {result.total} 条
          </span>
        )}
      </h2>

      <div className="mt-5">
        <CommentForm slug={slug} />
      </div>

      <div className="mt-8">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ) : result.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">
            还没有评论，来说第一句吧。
          </p>
        ) : (
          <ul>
            {result.items.map((comment) => (
              <CommentItem key={comment.id} comment={comment} slug={slug} />
            ))}
          </ul>
        )}
      </div>

      {result.pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
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
    </section>
  );
}
