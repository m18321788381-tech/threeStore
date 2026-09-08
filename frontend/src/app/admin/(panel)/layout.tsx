import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverGet } from "@/lib/api";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AuthGuard } from "@/components/admin/AuthGuard";

export const metadata = { title: "后台管理", robots: { index: false, follow: false } };

// 后台依赖登录态，禁止任何形式的预渲染 / 缓存
export const dynamic = "force-dynamic";

/**
 * 服务端鉴权守卫。
 *
 * 此前仅靠客户端 AuthGuard 拦截：未登录访问 /admin/* 仍会返回 200 与管理端 HTML 骨架，
 * 管理端代码结构对访客可见，且一旦客户端逻辑被绕过就会直接失守。
 * 这里改为在服务端先校验 token —— 无 token 或 token 失效时直接重定向到登录页，
 * 不向未授权请求返回任何后台内容。客户端 AuthGuard 保留作为第二道校验。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get("blog_token")?.value;
  if (!token) redirect("/admin/login");

  // 拿 token 去后端验一次，避免仅凭「cookie 存在」就放行
  const me = await serverGet<{ id: string; username: string }>("/auth/me", {
    token,
    revalidate: 0,
  });
  if (!me) redirect("/admin/login");

  return (
    <AuthGuard>
      <div className="-mx-5 flex flex-col gap-6 sm:-mx-6 lg:-mx-8 lg:flex-row lg:gap-8">
        <AdminSidebar />
        <main className="min-w-0 flex-1 lg:py-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
