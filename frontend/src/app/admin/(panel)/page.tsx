import Link from "next/link";
import { Dashboard } from "./Dashboard";

export default function AdminHome() {
  return (
    <>
      <header className="panel-head">
        <div>
          <h1 className="panel-title">仪表盘</h1>
          <p className="mt-1 text-meta text-muted">站点内容概览与快捷入口。</p>
        </div>
        <Link href="/admin/posts/new" className="btn-primary btn-sm">
          写新文章
        </Link>
      </header>

      <Dashboard />
    </>
  );
}
