import Link from "next/link";
import { Suspense } from "react";
import { serverGet } from "@/lib/api";
import { siteConfig } from "@/lib/site";
import { PostCard } from "@/components/post/PostCard";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { PostListSkeleton } from "@/components/common/Skeleton";
import type { Paginated, PostListItem, Category, Tag, ArchiveGroup } from "@/types";

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
      <div>
        {data.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination basePath="/" page={data.page} pages={data.pages} />
    </>
  );
}

/** 侧栏对齐设计稿 V-01：关于我 / 分类 / 标签云 / 归档，滚动时吸附。 */
async function Sidebar() {
  const [categories, tags, archive] = await Promise.all([
    serverGet<Category[]>("/categories"),
    serverGet<Tag[]>("/tags"),
    serverGet<{ groups: ArchiveGroup[] }>("/posts/archive"),
  ]);

  const years = new Map<string, number>();
  for (const group of archive?.groups || []) {
    years.set(group.year, (years.get(group.year) || 0) + group.items.length);
  }
  const yearRows = [...years.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, 5);

  return (
    <aside className="space-y-5 lg:sticky lg:top-[84px]">
      <section className="widget">
        <h2 className="widget-title">关于我</h2>
        <p className="mt-3 text-body leading-relaxed text-muted">
          {siteConfig.bio}
          <Link
            href="/feed.xml"
            className="ml-1 whitespace-nowrap font-medium text-accent hover:underline"
          >
            RSS 订阅 →
          </Link>
        </p>
      </section>

      <section className="widget">
        <h2 className="widget-title">分类</h2>
        {(categories || []).length ? (
          <ul className="mt-3 space-y-1.5">
            {categories!.map((cat) => (
              <li key={cat.slug}>
                <Link
                  href={`/categories/${cat.slug}`}
                  className="flex items-baseline justify-between gap-3 text-sm text-muted transition-colors hover:text-accent"
                >
                  <span className="truncate">{cat.name}</span>
                  <span className="shrink-0 tabular-nums">{cat.post_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">暂无分类</p>
        )}
      </section>

      <section className="widget">
        <h2 className="widget-title">标签云</h2>
        {(tags || []).length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags!.slice(0, 18).map((tag) => (
              <Link key={tag.slug} href={`/tags/${tag.slug}`} className="chip-sm">
                #{tag.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">暂无标签</p>
        )}
      </section>

      {yearRows.length > 0 && (
        <section className="widget">
          <h2 className="widget-title">归档</h2>
          <ul className="mt-3 space-y-1.5">
            {yearRows.map(([year, count]) => (
              <li key={year}>
                <Link
                  href="/archive"
                  className="flex items-baseline justify-between gap-3 text-sm text-muted transition-colors hover:text-accent"
                >
                  <span className="font-mono tabular-nums">{year}</span>
                  <span className="tabular-nums">{count} 篇</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
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
    <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 max-w-content">
        <h1 className="sr-only">最新文章</h1>
        <Suspense fallback={<PostListSkeleton />}>
          <PostList page={currentPage} />
        </Suspense>
      </section>

      <Suspense fallback={<div className="skeleton h-64" />}>
        <Sidebar />
      </Suspense>
    </div>
  );
}
