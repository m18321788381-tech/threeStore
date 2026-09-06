"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/common/Skeleton";
import type { Category, Tag } from "@/types";

type Item = { id: string; name: string; slug: string; post_count?: number };

export function TaxonomyPanel({ kind }: { kind: "categories" | "tags" }) {
  const queryClient = useQueryClient();
  const isCat = kind === "categories";
  const queryKey = [kind];

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => (isCat ? api.categories() : api.tags()),
  });

  const create = useMutation({
    mutationFn: () =>
      isCat
        ? api.createCategory({ name, slug: slug || undefined })
        : api.createTag({ name, slug: slug || undefined }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setError("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      isCat ? api.deleteCategory(id) : api.deleteTag(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const items = (data || []) as Item[];

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate();
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
      >
        <label className="text-sm">
          <span className="mb-1.5 block text-muted">名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCat ? "例如：后端工程" : "例如：Python"}
            className="w-48 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block text-muted">Slug（可选）</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="留空自动生成"
            className="w-48 rounded-lg border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
        </label>
        <button type="submit" disabled={create.isPending} className="btn-primary">
          {create.isPending ? "创建中…" : "新建"}
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </form>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted">还没有条目</li>
          )}
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <span className="font-medium">{item.name}</span>
              <span className="font-mono text-xs text-muted">/{item.slug}</span>
              {typeof item.post_count === "number" && (
                <span className="text-xs text-muted">{item.post_count} 篇</span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`删除「${item.name}」？`)) remove.mutate(item.id);
                }}
                className="ml-auto rounded border border-border px-2 py-1 text-xs text-red-500 hover:border-red-500"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
