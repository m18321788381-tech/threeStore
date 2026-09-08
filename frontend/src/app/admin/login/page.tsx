import { LoginForm } from "./LoginForm";
import { brandParts } from "@/lib/site";

export const metadata = { title: "登录", robots: { index: false, follow: false } };

export default function LoginPage() {
  const { prefix, suffix } = brandParts();

  return (
    <div className="mx-auto flex w-full max-w-[380px] flex-col px-1 py-16 sm:py-24">
      <div className="rounded-modal border border-border bg-card p-8 shadow-raised">
        <p className="text-center text-sm font-semibold tracking-tight">
          {prefix}
          {suffix && <span className="text-accent">{suffix}</span>}
        </p>
        <h1 className="mt-3 text-center text-[20px] font-bold tracking-tight">后台登录</h1>
        <p className="mt-1.5 text-center text-meta text-muted">使用博主账号登录后管理内容。</p>

        <LoginForm />
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-muted">
        默认账号来自后端 <code className="font-mono">.env</code>：ADMIN_USERNAME / ADMIN_PASSWORD
        <br />
        同一 IP 连续 5 次失败将锁定 15 分钟
      </p>
    </div>
  );
}
