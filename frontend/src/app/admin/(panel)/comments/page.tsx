import { CommentsPanel } from "./CommentsPanel";

export default async function AdminCommentsPage({
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
          <h1 className="panel-title">评论</h1>
          <p className="mt-1 text-meta text-muted">访客评论默认待审，通过后才会出现在文章页。</p>
        </div>
      </header>

      <CommentsPanel initialStatus={initialStatus} />
    </>
  );
}
