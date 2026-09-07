import Link from "next/link";
import type { LinkData } from "@/types";

type RefItem = { slug: string; title: string; summary?: string };

function Group({ title, items }: { title: string; items: RefItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="widget-title">
        {title}
        <span className="ml-1.5 tabular-nums">{items.length}</span>
      </h3>
      <ul className="mt-2.5 space-y-2">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={`/posts/${item.slug}`}
              className="group block rounded-btn border border-border px-3 py-2 transition-colors hover:border-accent"
            >
              <span className="line-clamp-2 block text-sm font-medium leading-snug transition-colors group-hover:text-accent">
                {item.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 双向链接：数字花园的核心价值。放在文章侧栏，与目录同级。 */
export function Backlinks({ data }: { data: LinkData }) {
  if (!data.outbound.length && !data.backlinks.length) return null;

  return (
    <section className="widget space-y-5">
      <Group title="引用本文" items={data.backlinks} />
      <Group title="本文引用" items={data.outbound} />
    </section>
  );
}
