import Link from "next/link";
import { Suspense } from "react";
import { serverGet } from "@/lib/api";
import { siteConfig } from "@/lib/site";
import { PostCard } from "@/components/post/PostCard";
import { Chip } from "@/components/common/Chip";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { PostListSkeleton } from "@/components/common/Skeleton";
import type { Paginated, PostListItem, Category, Tag } from "@/types";

export const revalidate = 60; // ISR：首页列表最多落后 60 秒

async function PostList({ page }: { page: number }) {
  const data = await serverGet<Paginated<PostListItem>>("/posts", {
    params: { page, page_size: 8, sort: "newest" },
  });

  if (!data || !data.items.length) {
    return (
      <EmptyState
        title="还没有发布文章"
        description="后端 API 未连接，或博主还没写下第一篇。到后台新建一篇文章试试。"
        action={
          <Link href="/admin/posts/new" className="btn-primary mt-2">
            去写第一篇
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {data.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination basePath="/" page={data.page} pages={data.pages} />
    </>
  );
}

async function Sidebar() {
  const [categories, tags] = await Promise.all([
    serverGet<Category[]>("/categories"),
    serverGet<Tag[]>("/tags"),
  ]);

  return (
    <aside className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold">分类</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(categories || []).length ? (
            (categories || []).map((cat) => (
              <Chip key={cat.slug} href={`/categories/${cat.slug}`} count={cat.post_count}>
                {cat.name}
              </Chip>
            ))
          ) : (
            <p className="text-sm text-muted">暂无分类</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">标签云</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(tags || []).length ? (
            (tags || []).map((tag) => (
              <Chip key={tag.slug} href={`/tags/${tag.slug}`} count={tag.post_count}>
                #{tag.name}
              </Chip>
            ))
          ) : (
            <p className="text-sm text-muted">暂无标签</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold">订阅</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          更新不频繁，但每篇都认真写。可以用 RSS 订阅。
        </p>
        <a href="/feed.xml" className="btn-ghost mt-3 w-full !py-1.5 text-xs">
          RSS Feed
        </a>
      </section>
    </aside>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-surface/50 px-7 py-12">
        <p className="text-sm text-accent">{siteConfig.author}</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
          {siteConfig.title}
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          {siteConfig.description}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/archive" className="btn-primary">
            浏览归档
          </Link>
          <Link href="/garden" className="btn-ghost">
            进入数字花园
          </Link>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">最新文章</h2>
            <Link href="/archive" className="text-sm text-muted hover:text-accent">
              全部 →
            </Link>
          </div>
          <Suspense fallback={<PostListSkeleton />}>
            <PostList page={currentPage} />
          </Suspense>
        </section>

        <Suspense fallback={<div className="skeleton h-64" />}>
          <Sidebar />
        </Suspense>
      </div>
    </div>
  );
}
