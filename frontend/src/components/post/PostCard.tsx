import Link from "next/link";
import type { PostListItem } from "@/types";
import { formatDate, readingTimeLabel } from "@/lib/utils";

/** 列表行：对齐设计稿 V-01 .post-card —— 用分隔线成组，不做卡片阴影。 */
export function PostCard({ post }: { post: PostListItem }) {
  return (
    <article className="post-row group">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta text-muted">
        {post.is_pinned && <span className="badge badge-accent">置顶</span>}
        {post.category && (
          <Link
            href={`/categories/${post.category.slug}`}
            className="cat-pill"
          >
            {post.category.name}
          </Link>
        )}
        <time dateTime={post.published_at || undefined}>{formatDate(post.published_at)}</time>
        <span aria-hidden>·</span>
        <span>{readingTimeLabel(post.reading_time)}</span>
        {post.status === 0 && <span className="badge badge-warning">草稿</span>}
      </div>

      <h2 className="post-row-title mt-2">
        <Link href={`/posts/${post.slug}`}>{post.title}</Link>
      </h2>

      {post.summary && (
        <p className="mt-2 line-clamp-2 leading-relaxed text-muted">{post.summary}</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {(post.tags || []).slice(0, 4).map((tag) => (
          <Link
            key={tag.slug}
            href={`/tags/${tag.slug}`}
            className="text-xs text-muted transition-colors hover:text-accent"
          >
            #{tag.name}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-4 text-xs text-muted tabular-nums">
          <span>{post.view_count} 阅读</span>
          <span>{post.comment_count} 评论</span>
        </span>
      </div>
    </article>
  );
}
