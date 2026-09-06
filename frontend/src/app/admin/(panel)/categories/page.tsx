import { TaxonomyPanel } from "@/components/admin/TaxonomyPanel";

export default function AdminCategoriesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">分类</h1>
        <p className="mt-1 text-sm text-muted">
          删除分类后，其下文章会回落到「未分类」。
        </p>
      </header>
      <TaxonomyPanel kind="categories" />
    </div>
  );
}
