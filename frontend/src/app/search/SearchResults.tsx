import { serverGet } from "@/lib/api";
import { PostCard } from "@/components/post/PostCard";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import type { Paginated, PostListItem } from "@/types";

export async function SearchResults({ q, page }: { q: string; page: number }) {
  if (!q.trim()) {
    return (
      <EmptyState
        title="输入关键词开始搜索"
        description="在页面右上角的搜索框，或在下方直接输入。"
        action={<SearchBox defaultQuery="" />}
      />
    );
  }

  const data = await serverGet<Paginated<PostListItem> & { keyword: string }>(
    "/search",
    { params: { q, page, page_size: 10 }, revalidate: 0 }
  );

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title={`没有找到与「${q}」相关的文章`}
        description="换个关键词试试，或者去归档页翻翻。"
      />
    );
  }

  return (
    <>
      <p className="mb-5 text-sm text-muted">
        「{q}」共匹配 <b className="text-foreground">{data.total}</b> 篇
      </p>
      <div className="grid gap-4">
        {data.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination basePath="/search" page={data.page} pages={data.pages} query={{ q }} />
    </>
  );
}

function SearchBox({ defaultQuery }: { defaultQuery: string }) {
  return (
    <form action="/search" className="mt-2 flex w-full max-w-sm gap-2">
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="搜索文章…"
        className="input flex-1"
      />
      <button type="submit" className="btn-primary btn-sm">
        搜索
      </button>
    </form>
  );
}
