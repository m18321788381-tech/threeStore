import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-content flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-2">
        {/* 装饰圆环：克制但不空洞 */}
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-border" aria-hidden />
        <p className="relative font-mono text-6xl font-bold text-accent">404</p>
      </div>
      <h1 className="page-title mt-6 text-2xl">页面不存在</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
        这个地址可能已经失效，或者文章被移到了别处。试试搜索或从归档里找到你要看的内容。
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-primary">
          回到首页
        </Link>
        <Link href="/search" className="btn-ghost">
          搜索文章
        </Link>
        <Link href="/archive" className="btn-ghost">
          浏览归档
        </Link>
      </div>
    </div>
  );
}
