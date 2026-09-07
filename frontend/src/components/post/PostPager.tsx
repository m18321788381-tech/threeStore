import Link from "next/link";
import type { Ref } from "@/types";

export function PostPager({ prev, next }: { prev: Ref | null; next: Ref | null }) {
  if (!prev && !next) return null;

  return (
    <nav className="mt-14 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={`/posts/${prev.slug}`} className="card group p-4 card-hover">
          <span className="text-xs text-muted">← 上一篇</span>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium group-hover:text-accent">
            {prev.name}
          </p>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={`/posts/${next.slug}`}
          className="card group p-4 text-right card-hover"
        >
          <span className="text-xs text-muted">下一篇 →</span>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium group-hover:text-accent">
            {next.name}
          </p>
        </Link>
      )}
    </nav>
  );
}
