"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Skeleton";
import type { StatsOverview } from "@/types";

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <>
      <span className="stat-value tabular-nums">{value.toLocaleString("zh-CN")}</span>
      <span className="stat-label">{label}</span>
    </>
  );

  return href ? (
    <Link href={href} className="stat block transition-colors hover:border-accent">
      {inner}
    </Link>
  ) : (
    <div className="stat">{inner}</div>
  );
}

export function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats(),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px]" />
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
    <div className="space-y-9">
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="side-title mb-3">
          内容概览
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="文章总数" value={s.post_count} href="/admin/posts" />
          <StatCard label="已发布" value={s.published_count} href="/admin/posts?status=1" />
          <StatCard label="草稿" value={s.draft_count} href="/admin/posts?status=0" />
          <StatCard label="总阅读量" value={s.total_views} />
          <StatCard label="评论总数" value={s.comment_count} href="/admin/comments" />
          <StatCard label="待审评论" value={s.pending_comment_count} href="/admin/comments?status=0" />
          <StatCard label="分类 / 标签" value={s.category_count + s.tag_count} />
          <StatCard label="媒体 / 外链" value={s.media_count + s.link_count} />
        </div>
      </section>

      <section aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="side-title mb-3">
          快捷操作
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/posts/new" className="btn-primary btn-sm">
            写新文章
          </Link>
          <Link href="/admin/comments?status=0" className="btn-ghost btn-sm">
            审核待处理评论
          </Link>
          <Link href="/admin/media" className="btn-ghost btn-sm">
            上传图片
          </Link>
          <Link href="/garden" className="btn-ghost btn-sm">
            查看知识图谱
          </Link>
        </div>
      </section>
    </div>
  );
}
