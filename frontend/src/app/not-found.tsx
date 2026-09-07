import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-content flex-col items-center justify-center py-24 text-center">
      <p className="font-mono text-6xl font-bold text-accent">404</p>
      <h1 className="page-title mt-6 text-2xl">页面不存在</h1>
      <p className="mt-3 text-sm text-muted">
        这个地址可能已经失效，或者文章被移到了别处。
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn-primary">
          回到首页
        </Link>
        <Link href="/archive" className="btn-ghost">
          浏览归档
        </Link>
      </div>
    </div>
  );
}
