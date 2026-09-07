import Link from "next/link";
import { PostsTable } from "./PostsTable";

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const parsed = status === undefined ? Number.NaN : Number(status);
  const initialStatus = Number.isFinite(parsed) ? parsed : undefined;

  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">文章</h1>
          <p className="mt-1 text-meta text-muted">草稿、已发布与归档都在这里。</p>
        </div>
        <Link href="/admin/posts/new" className="btn-primary btn-sm">
          写新文章
        </Link>
      </header>

      <PostsTable initialStatus={initialStatus} />
    </>
  );
}
