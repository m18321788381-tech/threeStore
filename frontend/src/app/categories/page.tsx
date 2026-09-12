import Link from "next/link";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { EmptyState } from "@/components/common/EmptyState";
import type { Category } from "@/types";

export const metadata: Metadata = { title: "分类" };
export const revalidate = 300;

export default async function CategoriesPage() {
  const categories = await serverGet<Category[]>("/categories");

  return (
    <div className="mx-auto max-w-content">
      <Breadcrumb items={[{ name: "分类" }]} />
      <header className="page-head">
        <h1 className="page-title">分类</h1>
        <p className="page-desc">按主题浏览全部文章。</p>
      </header>

      {!categories || categories.length === 0 ? (
        <EmptyState title="还没有分类" description="在后台创建分类后，这里会自动列出。" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="card card-hover group p-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold group-hover:text-accent">{cat.name}</h2>
                <span className="text-xs text-muted">{cat.post_count} 篇</span>
              </div>
              {cat.description && (
                <p className="page-desc">{cat.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
