import { TaxonomyPanel } from "@/components/admin/TaxonomyPanel";

export default function AdminTagsPage() {
  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">标签</h1>
          <p className="mt-1 text-meta text-muted">标签与文章是多对多关系。</p>
        </div>
      </header>
      <TaxonomyPanel kind="tags" />
    </>
  );
}
