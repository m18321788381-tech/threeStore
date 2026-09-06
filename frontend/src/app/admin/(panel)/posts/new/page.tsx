import { PostEditor } from "@/components/editor/PostEditor";

export default function NewPostPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">写新文章</h1>
        <p className="mt-1 text-sm text-muted">支持 GFM 语法与 [[双向链接]]。</p>
      </header>
      <PostEditor />
    </div>
  );
}
