"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MarkdownEditor } from "./MarkdownEditor";
import { Skeleton } from "@/components/common/Skeleton";
import type { Category, PostDetail, Tag } from "@/types";

export function PostEditor({ postId }: { postId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories(),
  });
  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: () => api.tags() });
  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-post", postId],
    queryFn: () => api.adminPost(postId as string),
    enabled: Boolean(postId),
  });

  const { data: allPosts } = useQuery({
    queryKey: ["admin-posts-title"],
    queryFn: () => api.posts({ page: 1, page_size: 200 }),
  });

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setSlug(existing.slug);
    setSummary(existing.summary || "");
    setCoverUrl(existing.cover_url || "");
    setContent(existing.content_md || "");
    setCategoryId(existing.category?.id || "");
    setTagIds((existing.tags || []).map((t) => t.id));
    setStatus(existing.status ?? 0);
  }, [existing]);

  const save = useMutation({
    mutationFn: async (nextStatus: number) => {
      const payload = {
        title,
        slug: slug || undefined,
        summary,
        cover_url: coverUrl,
        content_md: content,
        category_id: categoryId || null,
        tag_ids: tagIds,
        status: nextStatus,
      };
      if (postId) return api.updatePost(postId, payload);
      return api.createPost({ ...payload, status: nextStatus });
    },
    onSuccess: (data) => {
      setSaved("已保存");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      setTimeout(() => setSaved(""), 2000);
      if (!postId && data?.id) {
        router.replace(`/admin/posts/${data.id}/edit`);
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await api.upload(form);
      return data.url;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  };

  if (postId && isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-[620px]" />
      </div>
    );
  }

  const knownTitles = (allPosts?.items || []).map((p) => p.title);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="文章标题"
          className="input min-w-[240px] flex-1 text-lg font-semibold"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={save.isPending || !title.trim()}
            onClick={() => save.mutate(0)}
            className="btn-ghost"
          >
            存为草稿
          </button>
          <button
            type="button"
            disabled={save.isPending || !title.trim()}
            onClick={() => save.mutate(1)}
            className="btn-primary"
          >
            {save.isPending ? "保存中…" : "发布"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm text-success">
          {saved}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="field-label text-muted">Slug（留空自动生成）</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-first-post"
            className="input font-mono"
          />
        </label>

        <label className="text-sm">
          <span className="field-label text-muted">分类</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="input"
          >
            <option value="">未分类</option>
            {(categories || []).map((c: Category) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="field-label text-muted">摘要</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="input resize-y"
        />
      </label>

      <label className="block text-sm">
        <span className="field-label text-muted">封面图 URL（可选）</span>
        <input
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="/media/xxx.png"
          className="input font-mono text-xs"
        />
      </label>

      <div>
        <span className="field-label text-muted">标签</span>
        <div className="flex flex-wrap gap-2">
          {(tags || []).map((t: Tag) => {
            const active = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setTagIds((prev) =>
                    prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                  )
                }
                className={`chip ${active ? "border-accent bg-accent-soft text-accent" : ""}`}
              >
                #{t.name}
              </button>
            );
          })}
          {(tags || []).length === 0 && (
            <span className="text-xs text-muted">还没有标签，去「标签」页创建。</span>
          )}
        </div>
      </div>

      <MarkdownEditor
        value={content}
        onChange={setContent}
        knownTitles={knownTitles}
        onUpload={upload}
      />

      <p className="text-xs text-muted">
        提示：正文里写 <code className="font-mono text-accent">[[另一篇文章的标题]]</code>{" "}
        即可建立双向链接，保存后会自动出现在数字花园与被引用文章的反向链接里。
      </p>
    </div>
  );
}
