import type { Metadata } from "next";
import { SearchResults } from "./SearchResults";
import { Suspense } from "react";
import { PostListSkeleton } from "@/components/common/Skeleton";

export const metadata: Metadata = {
  title: "搜索",
  description: "按标题与正文全文搜索文章",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  return (
    <div className="mx-auto max-w-content">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">搜索</h1>
        <p className="mt-2 text-sm text-muted">搜索标题、摘要与正文。</p>
      </header>

      <Suspense key={`${q}-${currentPage}`} fallback={<PostListSkeleton count={2} />}>
        <SearchResults q={q} page={currentPage} />
      </Suspense>
    </div>
  );
}
