import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { PostCard } from "@/components/post/PostCard";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import type { Paginated, PostListItem, Tag } from "@/types";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tags = await serverGet<Tag[]>("/tags");
  const tag = (tags || []).find((t) => t.slug === slug);
  return { title: tag ? `标签：${tag.name}` : "标签" };
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  const [tags, data] = await Promise.all([
    serverGet<Tag[]>("/tags"),
    serverGet<Paginated<PostListItem>>("/posts", {
      params: { tag: slug, page: currentPage, page_size: 10 },
    }),
  ]);

  const tag = (tags || []).find((t) => t.slug === slug);
  if (!tag) notFound();

  return (
    <div className="mx-auto max-w-content">
      <header className="mb-8">
        <p className="text-sm text-muted">标签</p>
        <h1 className="mt-1 text-3xl font-bold">#{tag.name}</h1>
        <p className="mt-3 text-xs text-muted">共 {data?.total ?? 0} 篇</p>
      </header>

      {!data || data.items.length === 0 ? (
        <EmptyState title="这个标签下还没有文章" />
      ) : (
        <>
          <div className="grid gap-4">
            {data.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          <Pagination basePath={`/tags/${slug}`} page={data.page} pages={data.pages} />
        </>
      )}
    </div>
  );
}
