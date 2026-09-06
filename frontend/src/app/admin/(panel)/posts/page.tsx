import { PostsTable } from "./PostsTable";

export default function AdminPostsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">文章</h1>
          <p className="mt-1 text-sm text-muted">草稿与已发布都在这里。</p>
        </div>
        <a href="/admin/posts/new" className="btn-primary">
          写新文章
        </a>
      </header>

      <PostsTable />
    </div>
  );
}
