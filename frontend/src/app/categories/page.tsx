import Link from "next/link";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import type { Category } from "@/types";

export const metadata: Metadata = { title: "分类" };
export const revalidate = 300;

export default async function CategoriesPage() {
  const categories = await serverGet<Category[]>("/categories");

  return (
    <div className="mx-auto max-w-content">
      <header className="mb-10">
        <h1 className="text-3xl font-bold">分类</h1>
        <p className="mt-2 text-sm text-muted">按主题浏览全部文章。</p>
      </header>

      {!categories || categories.length === 0 ? (
        <EmptyState title="还没有分类" description="在后台创建分类后，这里会自动列出。" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="card group p-5 hover:border-accent/60"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold group-hover:text-accent">{cat.name}</h2>
                <span className="text-xs text-muted">{cat.post_count} 篇</span>
              </div>
              {cat.description && (
                <p className="mt-2 text-sm text-muted">{cat.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
