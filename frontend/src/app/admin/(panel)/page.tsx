import Link from "next/link";
import { Dashboard } from "./Dashboard";

export default function AdminHome() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">仪表盘</h1>
          <p className="mt-1 text-sm text-muted">站点内容概览与快捷入口。</p>
        </div>
        <Link href="/admin/posts/new" className="btn-primary">
          写新文章
        </Link>
      </header>

      <Dashboard />
    </div>
  );
}
