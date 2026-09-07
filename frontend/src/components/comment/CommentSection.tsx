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
      className={cn(compact ? "rounded-panel border border-border bg-card p-3" : "comment-form")}
    >
      {!compact && (
        <div className="mb-2.5 grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="昵称（选填）"
            maxLength={50}
            className="input"
          />
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="个人站点（选填）"
            maxLength={255}
            className="input"
          />
        </div>
      )}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={compact ? "回复这位读者…" : "说点什么…（支持纯文本，提交后需博主审核）"}
        rows={compact ? 3 : 4}
        maxLength={2000}
        className="input resize-y"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={mutation.isPending} className="btn-primary btn-sm">
          {mutation.isPending ? "提交中…" : parentId ? "回复" : "发表评论"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            取消
          </button>
        )}
        {error && (
          <span role="alert" className="text-sm text-error">
            {error}
          </span>
        )}
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
  const pending = comment.status === 0;

  return (
    <li className={cn("comment-row", pending && "comment-pending")}>
      <span className={cn("avatar", !comment.is_author && "avatar-muted")}>
        {initials(comment.author_name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-meta">
          <span className="font-medium">{comment.author_name}</span>
          {comment.is_author && <span className="author-badge">作者</span>}
          {comment.is_pinned && <span className="badge badge-muted">置顶</span>}
          {pending && <span className="badge badge-warning">待审核</span>}
          <time className="text-xs text-muted">{formatDateTime(comment.created_at)}</time>
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
          {comment.content}
        </p>

        {depth < 3 && (
          <div className="mt-1.5 flex gap-3.5 text-[12.5px] text-muted">
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="transition-colors hover:text-accent"
            >
              {replying ? "收起" : "回复"}
            </button>
          </div>
        )}

        {replying && (
          <div className="mt-3">
            <CommentForm slug={slug} parentId={comment.id} compact onDone={() => setReplying(false)} />
          </div>
        )}

        {comment.replies.length > 0 && (
          <ul className="ml-[52px] mt-2">
            {comment.replies.map((child) => (
              <CommentItem key={child.id} comment={child} slug={slug} depth={depth + 1} />
            ))}
          </ul>
        )}
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
    <section id="comments" className="mt-14 border-t-2 border-foreground pt-7">
      <h2 className="text-[19px] font-bold tracking-tight">评论</h2>
      <p className="mb-6 mt-1 text-meta text-muted">
        {result.total > 0 ? `共 ${result.total} 条 · ` : ""}发言前请先阅读社区约定，提交后需博主审核。
      </p>

      <CommentForm slug={slug} />

      <div className="mt-7">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="skeleton h-20" />
            ))}
          </div>
        ) : result.items.length === 0 ? (
          <p className="rounded-panel border border-dashed border-border px-6 py-10 text-center text-sm text-muted">
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
        <div className="mt-7 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-ghost btn-sm"
          >
            上一页
          </button>
          <span className="text-sm text-muted tabular-nums">
            {page} / {result.pages}
          </span>
          <button
            type="button"
            disabled={page >= result.pages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-ghost btn-sm"
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
