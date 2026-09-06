import type { Metadata } from "next";
import { serverGet } from "@/lib/api";
import { GraphCanvas } from "@/components/garden/GraphCanvas";
import { EmptyState } from "@/components/common/EmptyState";
import type { GraphData } from "@/types";

export const metadata: Metadata = {
  title: "数字花园",
  description: "用双向链接串起来的知识网络图谱",
};
export const revalidate = 300;

export default async function GardenPage() {
  const data = await serverGet<GraphData>("/garden/graph");
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  return (
    <div>
      <header className="mb-8 max-w-content">
        <h1 className="text-3xl font-bold">数字花园</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          每篇文章是一株植物，<code className="font-mono text-accent">[[双向链接]]</code>{" "}
          是它们之间的藤蔓。节点越大表示被引用得越多；孤立节点说明这篇笔记还没长进网络里。
        </p>
      </header>

      {nodes.length === 0 ? (
        <EmptyState
          title="图谱还是空的"
          description="在文章里用 [[另一篇文章的标题]] 建立第一条链接，保存后它就会出现在这里。"
          className="max-w-content"
        />
      ) : (
        <>
          <GraphCanvas data={{ nodes, edges }} />

          <section className="mt-12 max-w-content">
            <h2 className="text-lg font-semibold">引用最多的笔记</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {nodes
                .filter((n) => n.degree > 0)
                .slice(0, 8)
                .map((node) => (
                  <li key={node.id}>
                    <a
                      href={`/posts/${node.id}`}
                      className="card flex items-center justify-between p-3.5 hover:border-accent/60"
                    >
                      <span className="truncate text-sm font-medium">{node.title}</span>
                      <span className="ml-3 shrink-0 rounded bg-accent-soft px-2 py-0.5 text-xs text-accent">
                        {node.degree}
                      </span>
                    </a>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
