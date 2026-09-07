import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchBox, SearchResults } from "./SearchResults";
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
      <header className="page-head">
        <h1 className="page-title">搜索</h1>
        <p className="page-desc">在标题、摘要与正文中全文检索。</p>
      </header>

      <SearchBox defaultQuery={q} />

      <Suspense key={`${q}-${currentPage}`} fallback={<PostListSkeleton count={2} />}>
        <SearchResults q={q} page={currentPage} />
      </Suspense>
    </div>
  );
}
