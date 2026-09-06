"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import type { StatsOverview } from "@/types";

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="card p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="transition-colors hover:border-accent/60">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats(),
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        title="无法加载统计数据"
        description="后端未连接或登录已过期，请重新登录后再试。"
      />
    );
  }

  const s = data as StatsOverview;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="文章总数" value={s.post_count} href="/admin/posts" />
        <StatCard label="已发布" value={s.published_count} href="/admin/posts" />
        <StatCard label="草稿" value={s.draft_count} href="/admin/posts" />
        <StatCard label="待审评论" value={s.pending_comment_count} href="/admin/comments" />
        <StatCard label="评论总数" value={s.comment_count} href="/admin/comments" />
        <StatCard label="总阅读量" value={s.total_views} />
        <StatCard label="分类 / 标签" value={s.category_count} href="/admin/categories" />
        <StatCard label="双向链接" value={s.link_count} href="/garden" />
      </div>

      <section>
        <h2 className="text-sm font-semibold">快捷操作</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/posts/new" className="btn-primary !py-1.5 text-xs">
            写新文章
          </Link>
          <Link href="/admin/comments?status=0" className="btn-ghost !py-1.5 text-xs">
            审核待处理评论
          </Link>
          <Link href="/admin/media" className="btn-ghost !py-1.5 text-xs">
            上传图片
          </Link>
          <Link href="/garden" className="btn-ghost !py-1.5 text-xs">
            查看知识图谱
          </Link>
        </div>
      </section>
    </div>
  );
}
