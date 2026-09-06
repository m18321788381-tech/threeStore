import { TaxonomyPanel } from "@/components/admin/TaxonomyPanel";

export default function AdminTagsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">标签</h1>
        <p className="mt-1 text-sm text-muted">标签与文章是多对多关系。</p>
      </header>
      <TaxonomyPanel kind="tags" />
    </div>
  );
}
