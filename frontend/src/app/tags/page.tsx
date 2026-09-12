import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Chip } from "@/components/common/Chip";
import { EmptyState } from "@/components/common/EmptyState";
import type { Tag } from "@/types";

export const metadata: Metadata = { title: "标签" };
export const revalidate = 300;

export default async function TagsPage() {
  const tags = await serverGet<Tag[]>("/tags");

  return (
    <div className="mx-auto max-w-content">
      <Breadcrumb items={[{ name: "标签" }]} />
      <header className="page-head">
        <h1 className="page-title">标签</h1>
        <p className="page-desc">共 {tags?.length ?? 0} 个标签。</p>
      </header>

      {!tags || tags.length === 0 ? (
        <EmptyState title="还没有标签" description="在后台或写文章时创建标签。" />
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {tags.map((tag) => (
            <Chip key={tag.slug} href={`/tags/${tag.slug}`} count={tag.post_count}>
              #{tag.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
