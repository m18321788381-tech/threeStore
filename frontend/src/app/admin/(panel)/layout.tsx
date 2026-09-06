import Link from "next/link";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AuthGuard } from "@/components/admin/AuthGuard";

export const metadata = { title: "后台管理", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="-mx-5 flex flex-col gap-6 sm:-mx-6 lg:flex-row lg:gap-10">
        <AdminSidebar />
        <div className="min-w-0 flex-1 lg:py-6">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-xs text-muted">
              后台管理 · <Link href="/" className="hover:text-accent">返回前台</Link>
            </p>
          </div>
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
