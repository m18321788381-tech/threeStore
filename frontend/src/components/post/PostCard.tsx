import Link from "next/link";
import type { PostListItem } from "@/types";
import { formatDate, readingTimeLabel } from "@/lib/utils";

export function PostCard({ post, dense = false }: { post: PostListItem; dense?: boolean }) {
  return (
    <article className="card group p-5 hover:border-accent/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <time dateTime={post.published_at || undefined}>
          {formatDate(post.published_at)}
        </time>
        <span aria-hidden>·</span>
        <span>{readingTimeLabel(post.reading_time)}</span>
        {post.category && (
          <>
            <span aria-hidden>·</span>
            <Link href={`/categories/${post.category.slug}`} className="hover:text-accent">
              {post.category.name}
            </Link>
          </>
        )}
        {post.status === 0 && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">草稿</span>
        )}
      </div>

      <h2 className={dense ? "mt-2 text-base font-semibold" : "mt-2.5 text-lg font-semibold"}>
        <Link href={`/posts/${post.slug}`} className="hover:text-accent">
          {post.title}
        </Link>
      </h2>

      {post.summary && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
          {post.summary}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(post.tags || []).slice(0, 4).map((tag) => (
          <Link
            key={tag.slug}
            href={`/tags/${tag.slug}`}
            className="chip !py-0.5 !text-[11px]"
          >
            #{tag.name}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span>{post.view_count} 阅读</span>
          <span>{post.comment_count} 评论</span>
        </span>
      </div>
    </article>
  );
}
