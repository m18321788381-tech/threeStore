"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
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
    mutationFn: (id: string) => (isCat ? api.deleteCategory(id) : api.deleteTag(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const items = (data || []) as Item[];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate();
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="widget flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label htmlFor="taxonomy-name" className="field-label">
            名称
          </label>
          <input
            id="taxonomy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCat ? "例如：后端工程" : "例如：Python"}
            className="input"
          />
        </div>
        <div className="w-44">
          <label htmlFor="taxonomy-slug" className="field-label">
            Slug（可选）
          </label>
          <input
            id="taxonomy-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="留空自动生成"
            className="input font-mono"
          />
        </div>
        <button type="submit" disabled={create.isPending} className="btn-primary">
          {create.isPending ? "创建中…" : "新建"}
        </button>
        {error && (
          <p role="alert" className="w-full text-meta text-error">
            {error}
          </p>
        )}
      </form>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="还没有条目" description="用上面的表单创建第一个。" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th className="w-56">Slug</th>
                <th className="w-20 text-right">文章数</th>
                <th className="w-20 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-surface">
                  <td className="font-medium">{item.name}</td>
                  <td className="font-mono text-xs text-muted">/{item.slug}</td>
                  <td className="text-right tabular-nums text-muted">
                    {typeof item.post_count === "number" ? item.post_count : "—"}
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`删除「${item.name}」？`)) remove.mutate(item.id);
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
    </div>
  );
}
