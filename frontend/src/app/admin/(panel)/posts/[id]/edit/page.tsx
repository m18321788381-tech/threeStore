import { PostEditor } from "@/components/editor/PostEditor";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">编辑文章</h1>
        <p className="mt-1 font-mono text-xs text-muted">{id}</p>
      </header>
      <PostEditor postId={id} />
    </div>
  );
}
