import { LoginForm } from "./LoginForm";

export const metadata = { title: "登录", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center py-20">
      <h1 className="page-title text-2xl">后台登录</h1>
      <p className="mt-2 text-sm text-muted">使用博主账号登录以管理内容。</p>
      <LoginForm />
    </div>
  );
}
