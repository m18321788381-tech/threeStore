import Link from "next/link";
import type { LinkData } from "@/types";

/** 反向引用：谁引用了本文 —— 数字花园的核心价值。 */
export function Backlinks({ data }: { data: LinkData }) {
  const hasOutbound = data.outbound.length > 0;
  const hasBacklinks = data.backlinks.length > 0;
  if (!hasOutbound && !hasBacklinks) return null;

  return (
    <section className="mt-14 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
      <div>
        <h2 className="side-title">
          本文引用了
          <span className="badge badge-accent ml-2 font-normal">
            {data.outbound.length}
          </span>
        </h2>
        {hasOutbound ? (
          <ul className="mt-3 space-y-2.5">
            {data.outbound.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/posts/${item.slug}`}
                  className="group block rounded-lg border border-border p-3 card-hover"
                >
                  <span className="text-sm font-medium group-hover:text-accent">
                    {item.title}
                  </span>
                  {item.summary && (
                    <span className="mt-1 line-clamp-2 block text-xs text-muted">
                      {item.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted">还没有引用其他笔记。</p>
        )}
      </div>

      <div>
        <h2 className="side-title">
          引用本文的笔记
          <span className="badge badge-accent ml-2 font-normal">
            {data.backlinks.length}
          </span>
        </h2>
        {hasBacklinks ? (
          <ul className="mt-3 space-y-2.5">
            {data.backlinks.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/posts/${item.slug}`}
                  className="group block rounded-lg border border-border p-3 card-hover"
                >
                  <span className="text-sm font-medium group-hover:text-accent">
                    {item.title}
                  </span>
                  {item.summary && (
                    <span className="mt-1 line-clamp-2 block text-xs text-muted">
                      {item.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted">
            暂无反向引用。它会在别的笔记写下 <code>[[{`本文标题`}]]</code> 时自动出现。
          </p>
        )}
      </div>
    </section>
  );
}
