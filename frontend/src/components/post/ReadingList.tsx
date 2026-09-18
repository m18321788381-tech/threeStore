"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDateTime } from "@/lib/utils";
import {
  clearBookmarks,
  readBookmarks,
  removeBookmark,
  type Bookmark,
} from "@/lib/reading";

/* 稍后读列表。
   必须挂载后再读 localStorage：服务端渲染拿不到这份数据，
   若在首次渲染就读会把服务端/客户端结果渲染成不一致。 */
export function ReadingList() {
  const [items, setItems] = useState<Bookmark[] | null>(null);

  useEffect(() => {
    setItems(readBookmarks().sort((a, b) => b.saved_at - a.saved_at));
  }, []);

  /* null = 尚未读取完成。用骨架占位而不是直接显示「空」，
     否则每次进页面都会先闪一下空状态。 */
  if (items === null) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        title="稍后读还是空的"
        description="在任意文章底部点「稍后读」，就会收藏到这里。"
        action={
          <Link href="/posts" className="btn-ghost mt-2">
            去逛逛文章
          </Link>
        }
      />
    );
  }

  return (
    <>
      <p className="mb-1 text-meta text-muted">
        共 <b className="font-semibold tabular-nums text-foreground">{items.length}</b> 篇
      </p>
      <div>
        {items.map((item) => (
          <article key={item.slug} className="post-row group">
            <h2 className="post-row-title">
              <Link href={`/posts/${item.slug}`}>{item.title}</Link>
            </h2>
            {item.summary && (
              <p className="mt-2 line-clamp-2 leading-relaxed text-muted">
                {item.summary}
              </p>
            )}
            <div className="mt-3 flex items-center gap-4 text-meta text-muted">
              {/* 传数值而不是字符串：formatDateTime 内部已兜住非法值并返回空串，
                  而先转 toISOString() 会绕开那层兜底 —— 越界时间戳直接抛
                  RangeError，把整个稍后读页面打白。 */}
              <span>收藏于 {formatDateTime(item.saved_at)}</span>
              <button
                type="button"
                className="ml-auto transition-colors hover:text-error"
                onClick={() => {
                  removeBookmark(item.slug);
                  setItems((prev) =>
                    prev ? prev.filter((p) => p.slug !== item.slug) : prev
                  );
                }}
              >
                移除
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            clearBookmarks();
            setItems([]);
          }}
        >
          清空全部
        </button>
      </div>
    </>
  );
}
