"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MarkdownEditor } from "./MarkdownEditor";
import { Skeleton } from "@/components/common/Skeleton";
import { cn } from "@/lib/utils";
import {
  clearDraft,
  clockLabel,
  draftAgeLabel,
  draftKey,
  readDraft,
  sameDraft,
  writeDraft,
  type DraftForm,
  type DraftSnapshot,
} from "@/lib/draft";
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
  const [isPinned, setIsPinned] = useState(false);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  // ---- 本地草稿（防丢稿）----
  const key = draftKey(postId);
  const [pendingDraft, setPendingDraft] = useState<DraftSnapshot | null>(null);
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);
  const draftCheckedKey = useRef<string | null>(null);
  const lastSavedRef = useRef(0);

  const currentForm = (): DraftForm => ({
    title,
    slug,
    summary,
    cover_url: coverUrl,
    content_md: content,
    category_id: categoryId,
    tag_ids: tagIds,
    status,
    is_pinned: isPinned,
    canonical_url: canonicalUrl,
    noindex,
  });

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
    setIsPinned(Boolean(existing.is_pinned));
    setCanonicalUrl(existing.canonical_url || "");
    setNoindex(Boolean(existing.noindex));
  }, [existing]);

  // 服务端内容就绪后核对本地草稿：只有在确实比服务端内容「新」时才提示恢复，
  // 否则把误写入的快照悄悄清掉，避免每次进编辑页都弹同一个提示。
  useEffect(() => {
    if (postId && isLoading) return;
    // 按 draftKey 去重：新建保存后 URL 会 replace 成 /edit，
    // 此时组件可能复用，必须允许用新的 key 重新检查一次
    if (draftCheckedKey.current === key) return;
    draftCheckedKey.current = key;
    lastSavedRef.current = 0;

    const draft = readDraft(key);
    if (!draft) return;

    const server: DraftForm = {
      title: existing?.title ?? "",
      slug: existing?.slug ?? "",
      summary: existing?.summary ?? "",
      cover_url: existing?.cover_url ?? "",
      content_md: existing?.content_md ?? "",
      category_id: existing?.category?.id ?? "",
      tag_ids: (existing?.tags || []).map((t) => t.id),
      status: existing?.status ?? 0,
      is_pinned: Boolean(existing?.is_pinned),
      canonical_url: existing?.canonical_url ?? "",
      noindex: Boolean(existing?.noindex),
    };

    if (sameDraft(draft, server)) {
      clearDraft(key);
      return;
    }
    setPendingDraft(draft);
  }, [postId, isLoading, existing, key]);

  // 自动快照：变更 1.5s 防抖；若距上次落盘已超过 30s 则立即写，
  // 保证连续打字场景下最坏也只丢 30 秒内容。
  useEffect(() => {
    if (postId && isLoading) return; // 服务端内容还没到，别把空表单写进去
    if (pendingDraft) return; // 恢复提示未处理前，不能覆盖用户尚未选择的快照
    if (!title.trim() && !content.trim()) return; // 空表单不产生垃圾快照

    const wait = Date.now() - lastSavedRef.current > 30_000 ? 0 : 1500;
    const timer = setTimeout(() => {
      if (writeDraft(key, currentForm())) {
        lastSavedRef.current = Date.now();
        setAutosavedAt(lastSavedRef.current);
      }
    }, wait);
    return () => clearTimeout(timer);
    // currentForm 依赖全部表单字段，逐项列出以便精确触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    slug,
    summary,
    coverUrl,
    content,
    categoryId,
    tagIds,
    status,
    isPinned,
    canonicalUrl,
    noindex,
    postId,
    isLoading,
    pendingDraft,
    key,
  ]);

  const applyDraft = (draft: DraftSnapshot) => {
    setTitle(draft.title);
    setSlug(draft.slug);
    setSummary(draft.summary);
    setCoverUrl(draft.cover_url);
    setContent(draft.content_md);
    setCategoryId(draft.category_id);
    setTagIds(draft.tag_ids);
    setStatus(draft.status);
    setIsPinned(draft.is_pinned);
    setCanonicalUrl(draft.canonical_url);
    setNoindex(draft.noindex);
    setPendingDraft(null);
    lastSavedRef.current = Date.now();
    setAutosavedAt(lastSavedRef.current);
  };

  const discardDraft = () => {
    clearDraft(key);
    setPendingDraft(null);
  };

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
        is_pinned: isPinned,
        canonical_url: canonicalUrl.trim(),
        noindex,
      };
      if (postId) return api.updatePost(postId, payload);
      return api.createPost({ ...payload, status: nextStatus });
    },
    onSuccess: (data) => {
      setSaved("已保存");
      setError("");
      // 已落库：本地快照失去意义，清掉避免下次进入弹出恢复提示
      clearDraft(key);
      setAutosavedAt(null);
      setPendingDraft(null);
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
          aria-label="文章标题"
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta text-muted">
          {autosavedAt ? `草稿已自动保存到本地 · ${clockLabel(autosavedAt)}` : "编辑内容会自动保存到本地"}
        </p>
        {autosavedAt && (
          <button
            type="button"
            onClick={() => {
              clearDraft(key);
              setAutosavedAt(null);
            }}
            className="text-meta text-muted underline decoration-dotted underline-offset-4 hover:text-error"
          >
            清除本地草稿
          </button>
        )}
      </div>

      {pendingDraft && (
        <div className="rounded-btn border border-warning/40 bg-warning/5 px-3 py-3">
          <p className="text-sm">
            发现本地未保存草稿（{draftAgeLabel(pendingDraft.saved_at)}）
            {pendingDraft.title && <>：{pendingDraft.title}</>}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => applyDraft(pendingDraft)} className="btn-primary">
              恢复草稿
            </button>
            <button type="button" onClick={discardDraft} className="btn-ghost">
              丢弃，使用线上内容
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-btn border border-error/40 bg-error/5 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-btn border border-success/40 bg-success/5 px-3 py-2 text-sm text-success">
          {saved}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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

      <fieldset className="rounded-btn border border-border px-3.5 py-3">
        <legend className="px-1 text-meta text-muted">展示与收录</legend>
        <div className="space-y-3.5">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="mt-1"
            />
            <span>
              置顶这篇文章
              <span className="mt-0.5 block text-meta text-muted">
                仅影响列表页排序（始终排在最前）；归档页与 RSS 仍按时间排列。
              </span>
            </span>
          </label>

          <label className="block text-sm">
            <span className="field-label text-muted">
              规范链接 Canonical（留空即用本站地址）
            </span>
            <input
              value={canonicalUrl}
              onChange={(e) => setCanonicalUrl(e.target.value)}
              placeholder="https://原始出处.example.com/post"
              className="input font-mono text-xs"
            />
            <span className="mt-1 block text-meta text-muted">
              适用于转载、合作稿、多域名镜像：告诉搜索引擎哪个地址才是正本。
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
              className="mt-1"
            />
            <span>
              不参与搜索引擎收录（noindex）
              <span className="mt-0.5 block text-meta text-muted">
                文章仍可正常访问与分享，只是不会出现在搜索结果里。
              </span>
            </span>
          </label>
        </div>
      </fieldset>

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
                className={cn("chip cursor-pointer", active && "chip-active")}
              >
                #{t.name}
              </button>
            );
          })}
          {(tags || []).length === 0 && (
            <span className="text-meta text-muted">还没有标签，去「标签」页创建。</span>
          )}
        </div>
      </div>

      <MarkdownEditor
        value={content}
        onChange={setContent}
        knownTitles={knownTitles}
        onUpload={upload}
      />

      <p className="text-meta text-muted">
        提示：正文里写 <code className="font-mono text-accent">[[另一篇文章的标题]]</code>{" "}
        即可建立双向链接，保存后会自动出现在数字花园与被引用文章的反向链接里。
      </p>
    </div>
  );
}
