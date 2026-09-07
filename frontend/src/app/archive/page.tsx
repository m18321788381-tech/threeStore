import Link from "next/link";
import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import type { ArchiveGroup } from "@/types";

export const metadata: Metadata = { title: "归档" };
export const revalidate = 300;

type ArchiveEntry = { month: string; item: ArchiveGroup["items"][number] };

export default async function ArchivePage() {
  const data = await serverGet<{ groups: ArchiveGroup[]; total: number }>("/posts/archive");
  const groups = data?.groups || [];

  // 设计稿 V-03 按「年」成组，组内是 MM-DD · 标题 的单行列表
  const byYear = new Map<string, ArchiveEntry[]>();
  for (const group of groups) {
    const bucket = byYear.get(group.year) || [];
    bucket.push(...group.items.map((item) => ({ month: group.month, item })));
    byYear.set(group.year, bucket);
  }
  const years = [...byYear.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));

  return (
    <div>
      <header className="page-head">
        <h1 className="text-[26px] font-bold tracking-tight">
          归档 · 共 {data?.total ?? 0} 篇文章
        </h1>
        <p className="page-desc">按发布时间倒序排列，点击标题直达原文。</p>
      </header>

      {years.length === 0 ? (
        <EmptyState title="还没有归档内容" description="发布第一篇文章后，它会按年月出现在这里。" />
      ) : (
        <div className="space-y-10">
          {years.map(([year, entries]) => (
            <section key={year}>
              <h2 className="group-title">
                {year} · {entries.length} 篇
              </h2>
              <ul className="mt-1">
                {entries.map((entry) => (
                  <li
                    key={entry.item.id}
                    className="flex items-baseline gap-3 border-b border-border py-3 text-sm last:border-b-0"
                  >
                    <time className="shrink-0 font-mono tabular-nums text-muted">
                      {entry.month.padStart(2, "0")}-{entry.item.day}
                    </time>
                    <span className="text-muted" aria-hidden>
                      ·
                    </span>
                    <Link
                      href={`/posts/${entry.item.slug}`}
                      className="min-w-0 font-medium transition-colors hover:text-accent"
                    >
                      {entry.item.title}
                    </Link>
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
