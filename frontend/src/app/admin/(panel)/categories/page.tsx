import { TaxonomyPanel } from "@/components/admin/TaxonomyPanel";

export default function AdminCategoriesPage() {
  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">分类</h1>
          <p className="mt-1 text-meta text-muted">删除分类后，其下文章会回落到未分类。</p>
        </div>
      </header>
      <TaxonomyPanel kind="categories" />
    </>
  );
}
