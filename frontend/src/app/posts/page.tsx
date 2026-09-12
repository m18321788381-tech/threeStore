import Link from "next/link";
import { Suspense } from "react";
import { serverGet } from "@/lib/api";
import { PostCard } from "@/components/post/PostCard";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { PostListSkeleton } from "@/components/common/Skeleton";
import type { Paginated, PostListItem } from "@/types";

export const metadata = {
  title: "全部文章",
  description: "按发布时间浏览全部已发布文章",
};

export const revalidate = 60;

async function PostList({ page }: { page: number }) {
  const data = await serverGet<Paginated<PostListItem>>("/posts", {
    params: { page, page_size: 10, sort: "newest" },
  });

  if (!data || !data.items.length) {
    return (
      <EmptyState
        title="还没有发布文章"
        description="博主还没写下第一篇，或者后端 API 暂未连接。"
        action={
          <Link href="/archive" className="btn-ghost mt-2">
            前往归档
          </Link>
        }
      />
    );
  }

  return (
    <>
      <p className="mb-1 text-meta text-muted">
        共 <b className="font-semibold tabular-nums text-foreground">{data.total}</b> 篇
      </p>
      <div>
        {data.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination basePath="/posts" page={data.page} pages={data.pages} />
    </>
  );
}

/**
 * 全部文章页。此前 src/app/posts/ 下只有 [slug] 子路由、缺少 page.tsx，
 * 导致 /posts 返回 404；这里补上独立列表页（首页为「列表 + 侧栏」的聚合视图，
 * 本页为纯列表，便于直链分享与分页深链）。
 */
export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  return (
    <div className="mx-auto max-w-content">
      <Breadcrumb items={[{ name: "全部文章" }]} />
      <header className="page-head">
        <h1 className="page-title">全部文章</h1>
        <p className="page-desc">按发布时间倒序排列，共览全部已发布内容。</p>
      </header>

      <Suspense key={currentPage} fallback={<PostListSkeleton count={3} />}>
        <PostList page={currentPage} />
      </Suspense>
    </div>
  );
}
