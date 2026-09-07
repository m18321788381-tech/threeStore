import Link from "next/link";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import type { ArchiveGroup } from "@/types";

export const metadata: Metadata = { title: "归档" };
export const revalidate = 300;

export default async function ArchivePage() {
  const data = await serverGet<{ groups: ArchiveGroup[]; total: number }>(
    "/posts/archive"
  );
  const groups = data?.groups || [];

  return (
    <div className="mx-auto max-w-content">
      <header className="page-head">
        <h1 className="page-title">归档</h1>
        <p className="page-desc">
          共 {data?.total ?? 0} 篇文章，按发布时间倒序排列。
        </p>
      </header>

      {groups.length === 0 ? (
        <EmptyState title="还没有归档内容" description="发布第一篇文章后，它会按年月出现在这里。" />
      ) : (
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="section-title">
                  {group.year} 年 {Number(group.month)} 月
                </h2>
                <span className="text-xs text-muted">{group.items.length} 篇</span>
              </div>

              <ul className="border-l border-border pl-6">
                {group.items.map((item) => (
                  <li key={item.id} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-[27px] top-2 h-2 w-2 rounded-full border border-accent bg-background" />
                    <div className="flex flex-wrap items-baseline gap-3">
                      <time className="font-mono text-xs text-muted">
                        {item.day} 日
                      </time>
                      <Link
                        href={`/posts/${item.slug}`}
                        className="text-body font-medium hover:text-accent"
                      >
                        {item.title}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
