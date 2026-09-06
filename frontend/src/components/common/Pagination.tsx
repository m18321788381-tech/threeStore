import Link from "next/link";
import { cn } from "@/lib/utils";

function pageHref(basePath: string, page: number, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function Pagination({
  basePath,
  page,
  pages,
  query,
}: {
  basePath: string;
  page: number;
  pages: number;
  query?: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;

  const items: Array<number | "…"> = [];
  for (let i = 1; i <= pages; i += 1) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) items.push(i);
    else if (items[items.length - 1] !== "…") items.push("…");
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="分页">
      {page > 1 && (
        <Link href={pageHref(basePath, page - 1, query)} className="chip">
          上一页
        </Link>
      )}
      {items.map((item, index) =>
        item === "…" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={pageHref(basePath, item, query)}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2.5 text-sm transition-colors",
              item === page
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            )}
          >
            {item}
          </Link>
        )
      )}
      {page < pages && (
        <Link href={pageHref(basePath, page + 1, query)} className="chip">
          下一页
        </Link>
      )}
    </nav>
  );
}
