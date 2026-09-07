"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphData } from "@/types";

type Node = SimulationNodeDatum & { id: string; title: string; degree: number };
type Link = SimulationLinkDatum<Node>;

const ISOLATED_LABEL = "孤立节点";

export function GraphCanvas({ data }: { data: GraphData }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<Node, Link> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const [showIsolated, setShowIsolated] = useState(true);
  const [hovered, setHovered] = useState<Node | null>(null);

  const { nodes, links } = useMemo(() => {
    const connected = new Set<string>();
    data.edges.forEach((e) => {
      connected.add(e.source);
      connected.add(e.target);
    });

    const visible = showIsolated
      ? data.nodes
      : data.nodes.filter((n) => connected.has(n.id));

    const idSet = new Set(visible.map((n) => n.id));
    const nodeList: Node[] = visible.map((n) => ({
      id: n.id,
      title: n.title,
      degree: n.degree,
    }));
    const linkList: Link[] = data.edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    return { nodes: nodeList, links: linkList };
  }, [data, showIsolated]);

  const isolatedCount = useMemo(() => {
    const connected = new Set<string>();
    data.edges.forEach((e) => {
      connected.add(e.source);
      connected.add(e.target);
    });
    return data.nodes.filter((n) => !connected.has(n.id)).length;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = wrap.clientWidth;
    let height = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      simRef.current?.force("center", forceCenter(width / 2, height / 2));
      simRef.current?.alpha(0.3).restart();
    };
    resize();

    const simulation = forceSimulation<Node, Link>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(110)
          .strength(0.35)
      )
      .force("charge", forceManyBody<Node>().strength(-260))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<Node>(34));
    simRef.current = simulation;

    let dragNode: Node | null = null;
    let panning = false;
    let lastPos = { x: 0, y: 0 };
    let moved = false;

    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const t = transformRef.current;
      return {
        x: (clientX - rect.left - t.x) / t.k,
        y: (clientY - rect.top - t.y) / t.k,
      };
    };

    const pick = (wx: number, wy: number) =>
      nodes.find(
        (n) => (n.x ?? 0) - 26 <= wx && wx <= (n.x ?? 0) + 26 && (n.y ?? 0) - 18 <= wy && wy <= (n.y ?? 0) + 18
      ) || null;

    const draw = () => {
      const t = transformRef.current;
      const styles = getComputedStyle(document.documentElement);
      const fg = styles.getPropertyValue("--fg").trim() || "#1e293b";
      const border = styles.getPropertyValue("--border").trim() || "#e2e8f0";
      const accent = styles.getPropertyValue("--accent").trim() || "#2563eb";
      const bg = styles.getPropertyValue("--bg").trim() || "#ffffff";

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      // 边
      ctx.strokeStyle = border;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1 / t.k;
      links.forEach((l) => {
        const s = l.source as Node;
        const target = l.target as Node;
        if (s.x == null || target.x == null) return;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(target.x, target.y!);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // 节点
      nodes.forEach((n) => {
        if (n.x == null || n.y == null) return;
        const r = 7 + Math.min(6, n.degree * 1.6);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = n === hovered ? 1 : n.degree > 0 ? 0.85 : 0.45;
        ctx.fill();
        ctx.globalAlpha = 1;
        /* 用背景色描边做“光晕”，让节点从连线里干净地浮出来 */
        ctx.lineWidth = 3 / t.k;
        ctx.strokeStyle = bg;
        ctx.stroke();

        ctx.fillStyle = fg;
        ctx.font = `${12 / t.k}px system-ui, -apple-system, "PingFang SC", sans-serif`;
        ctx.textAlign = "center";
        const label =
          n.title.length > 12 ? `${n.title.slice(0, 12)}…` : n.title;
        ctx.fillText(label, n.x, n.y + r + 12 / t.k);
      });

      ctx.restore();
    };

    simulation.on("tick", draw);

    const onMouseDown = (e: MouseEvent) => {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const hit = pick(x, y);
      moved = false;
      if (hit) {
        dragNode = hit;
        simulation.alphaTarget(0.25).restart();
      } else {
        panning = true;
      }
      lastPos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const { x, y } = toWorld(e.clientX, e.clientY);
      if (dragNode) {
        dragNode.fx = x;
        dragNode.fy = y;
        moved = true;
      } else if (panning) {
        const t = transformRef.current;
        t.x += e.clientX - lastPos.x;
        t.y += e.clientY - lastPos.y;
        lastPos = { x: e.clientX, y: e.clientY };
        moved = true;
        draw();
      } else {
        const hit = pick(x, y);
        if (hit !== hovered) {
          setHovered(hit);
          canvas.style.cursor = hit ? "pointer" : "grab";
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (dragNode) {
        if (!moved) {
          router.push(`/posts/${dragNode.id}`);
        }
        dragNode.fx = null;
        dragNode.fy = null;
        dragNode = null;
        simulation.alphaTarget(0);
      }
      panning = false;
      void e;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = transformRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const k = Math.min(3, Math.max(0.35, t.k * factor));
      t.x = mx - ((mx - t.x) * k) / t.k;
      t.y = my - ((my - t.y) * k) / t.k;
      t.k = k;
      draw();
    };

    const onLeave = () => {
      setHovered(null);
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", resize);

    /* 切换主题时 CSS 变量会变，但 canvas 不会自动重绘，这里显式监听根节点 class */
    const themeObserver = new MutationObserver(() => draw());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    draw();

    return () => {
      themeObserver.disconnect();
      simulation.stop();
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, [nodes, links, hovered, router]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>
          笔记 <b className="text-foreground">{data.nodes.length}</b>
        </span>
        <span>
          链接 <b className="text-foreground">{data.edges.length}</b>
        </span>
        <span>
          {ISOLATED_LABEL} <b className="text-foreground">{isolatedCount}</b>
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={showIsolated}
            onChange={(e) => setShowIsolated(e.target.checked)}
          />
          显示孤立节点
        </label>
      </div>

      <div
        ref={wrapRef}
        className="relative h-[420px] w-full overflow-hidden rounded-panel border border-border bg-surface/40 sm:h-[560px]"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {hovered && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-btn border border-border bg-background/95 px-3 py-2 text-xs shadow-sm">
            <b>{hovered.title}</b>
            <span className="ml-2 text-muted">被引用 {hovered.degree} 次</span>
          </div>
        )}
        {data.nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted">
            还没有笔记，先在文章里用 [[]] 建立链接吧。
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        滚轮缩放 · 拖拽平移 · 拖动节点固定位置 · 单击节点跳转文章
      </p>
    </div>
  );
}
