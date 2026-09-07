import { CommentsPanel } from "./CommentsPanel";

export default function AdminCommentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title text-2xl">评论</h1>
        <p className="mt-1 text-sm text-muted">
          访客评论默认待审，通过后才会出现在文章页。
        </p>
      </header>
      <CommentsPanel />
    </div>
  );
}
