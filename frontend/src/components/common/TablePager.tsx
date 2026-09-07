"use client";

/** 列表页统一分页器：高度、间距、禁用态在所有后台表格中保持一致。 */
export function TablePager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-3 pt-1" aria-label="分页">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
        className="btn-ghost btn-sm min-w-20 disabled:opacity-50"
      >
        ← 上一页
      </button>
      <span className="text-meta tabular-nums text-muted">
        {page} / {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="btn-ghost btn-sm min-w-20 disabled:opacity-50"
      >
        下一页 →
      </button>
    </nav>
  );
}
