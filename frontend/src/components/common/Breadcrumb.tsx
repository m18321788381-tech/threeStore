import { Fragment } from "react";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";

export type Crumb = {
  /** 显示文案 */
  name: string;
  /** 站内相对路径；最后一项（当前页）通常不传 */
  href?: string;
};

/**
 * 面包屑导航：**同时**输出可见导航与 BreadcrumbList 结构化数据。
 *
 * 为什么要两份：
 *   - 可见导航是给读者的，解决「我在哪、怎么上去」；
 *   - JSON-LD 是给搜索引擎的，Google 用 BreadcrumbList 在结果页展示层级路径
 *     替换掉裸 URL，这是 SERP 展示层的确定性收益，与点击与否无关。
 *   只做其中一个都是半成品，所以这里封装成一个组件，避免各页面重复实现时漏掉 JSON-LD。
 *
 * 首页由组件自动补在最前，调用方只传「首页之后」的部分。
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;

  const trail: Crumb[] = [{ name: "首页", href: "/" }, ...items];
  const lastIndex = trail.length - 1;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      // 当前页没有独立 URL 时省略 item 字段（schema.org 允许）
      ...(crumb.href ? { item: absoluteUrl(crumb.href) } : {}),
    })),
  };

  return (
    <>
      <nav className="crumb-nav" aria-label="面包屑">
        {trail.map((crumb, index) => {
          const isLast = index === lastIndex;
          return (
            <Fragment key={`${crumb.name}-${index}`}>
              {index > 0 && (
                <span className="crumb-sep" aria-hidden>
                  /
                </span>
              )}
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="crumb-link">
                  {crumb.name}
                </Link>
              ) : (
                <span
                  className={isLast ? "crumb-current" : undefined}
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.name}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
