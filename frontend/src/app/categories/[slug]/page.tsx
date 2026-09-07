import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { PostCard } from "@/components/post/PostCard";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import type { Paginated, PostListItem, Category } from "@/types";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categories = await serverGet<Category[]>("/categories");
  const category = (categories || []).find((c) => c.slug === slug);
  return {
    title: category ? `分类：${category.name}` : "分类",
    description: category?.description || undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  const [categories, data] = await Promise.all([
    serverGet<Category[]>("/categories"),
    serverGet<Paginated<PostListItem>>("/posts", {
      params: { category: slug, page: currentPage, page_size: 10 },
    }),
  ]);

  const category = (categories || []).find((c) => c.slug === slug);
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-content">
      <header className="page-head">
        <p className="text-sm text-muted">分类</p>
        <h1 className="page-title mt-1">{category.name}</h1>
        {category.description && (
          <p className="page-desc">{category.description}</p>
        )}
        <p className="mt-2 text-meta text-muted">共 {data?.total ?? 0} 篇</p>
      </header>

      {!data || data.items.length === 0 ? (
        <EmptyState title="这个分类下还没有文章" />
      ) : (
        <>
          <div className="grid gap-4">
            {data.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          <Pagination
            basePath={`/categories/${slug}`}
            page={data.page}
            pages={data.pages}
          />
        </>
      )}
    </div>
  );
}
