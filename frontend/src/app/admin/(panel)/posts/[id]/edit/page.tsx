import { PostEditor } from "@/components/editor/PostEditor";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">编辑文章</h1>
          <p className="mt-1 font-mono text-meta text-muted">{id}</p>
        </div>
      </header>

      <PostEditor postId={id} />
    </>
  );
}
