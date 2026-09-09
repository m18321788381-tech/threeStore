import { MediaPanel } from "@/components/admin/MediaPanel";

export default function AdminMediaPage() {
  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">媒体</h1>
          <p className="mt-1 text-meta text-muted">
            仅支持图片，单文件不超过 10MB。上传后可在编辑器里直接插入。
          </p>
        </div>
      </header>
      <MediaPanel />
    </>
  );
}
