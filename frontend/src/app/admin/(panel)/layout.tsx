import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AuthGuard } from "@/components/admin/AuthGuard";

export const metadata = { title: "后台管理", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="-mx-5 flex flex-col gap-6 sm:-mx-6 lg:-mx-8 lg:flex-row lg:gap-8">
        <AdminSidebar />
        <main className="min-w-0 flex-1 lg:py-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
