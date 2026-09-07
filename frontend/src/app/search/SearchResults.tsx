import Link from "next/link";
import { serverGet } from "@/lib/api";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDate, readingTimeLabel } from "@/lib/utils";
import type { Paginated, PostListItem } from "@/types";

/** 顶部常驻搜索框：用原生 GET 表单，无 JS 也能用。 */
export function SearchBox({ defaultQuery }: { defaultQuery: string }) {
  return (
    <form action="/search" method="get" className="search-box mb-9" role="search">
      <input
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder="输入关键词，回车搜索…"
        aria-label="搜索关键词"
        className="input h-11 flex-1 text-[15px]"
      />
      <button type="submit" className="btn-primary h-11 px-5">
        搜索
      </button>
    </form>
  );
}

export async function SearchResults({ q, page }: { q: string; page: number }) {
  const query = q.trim();

  if (!query) {
    return (
      <EmptyState
        title="输入关键词开始搜索"
        description="支持标题、摘要与正文匹配，也可以从归档页按时间浏览。"
      />
    );
  }

  const data = await serverGet<Paginated<PostListItem>>("/search", {
    params: { q: query, page, page_size: 10 },
    revalidate: 0,
  });

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title={`没有找到与「${query}」相关的文章`}
        description="换个关键词试试，或者去归档页翻翻。"
        action={
          <Link href="/archive" className="btn-ghost btn-sm">
            前往归档
          </Link>
        }
      />
    );
  }

  // 接口不返回高亮片段，这里在前端按分词命中；最多取前 6 个词，避免正则爆炸
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 6);

  return (
    <>
      <p className="mb-1 text-meta text-muted">
        「{query}」共匹配{" "}
        <b className="font-semibold tabular-nums text-foreground">{data.total}</b> 篇
      </p>

      <ul className="border-t border-border">
        {data.items.map((post) => (
          <li key={post.id} className="border-b border-border py-5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-muted">
              {post.category && (
                <Link
                  href={`/categories/${post.category.slug}`}
                  className="badge badge-accent transition-opacity hover:opacity-80"
                >
                  {post.category.name}
                </Link>
              )}
              <time dateTime={post.published_at || undefined}>{formatDate(post.published_at)}</time>
              <span aria-hidden>·</span>
              <span>{readingTimeLabel(post.reading_time)}</span>
            </div>

            <h2 className="mt-1.5 text-[18px] font-bold leading-snug tracking-tight">
              <Link href={`/posts/${post.slug}`} className="transition-colors hover:text-accent">
                <Highlight text={post.title} terms={terms} />
              </Link>
            </h2>

            {post.summary && (
              <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted">
                <Highlight text={post.summary} terms={terms} />
              </p>
            )}
          </li>
        ))}
      </ul>

      <Pagination basePath="/search" page={data.page} pages={data.pages} query={{ q: query }} />
    </>
  );
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 安全高亮：切分字符串后包 <mark>，不走 innerHTML，用户输入不可能注入标签。 */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const pattern = terms.map(escapeRegExp).filter(Boolean).join("|");
  if (!pattern) return <>{text}</>;

  const parts = text.split(new RegExp(`(${pattern})`, "gi"));

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={`${part}-${index}`} className="kw">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
