import { PostEditor } from "@/components/editor/PostEditor";

export default function NewPostPage() {
  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">写新文章</h1>
          <p className="mt-1 text-meta text-muted">支持 GFM 语法与 [[双向链接]]。</p>
        </div>
      </header>

      <PostEditor />
    </>
  );
}
