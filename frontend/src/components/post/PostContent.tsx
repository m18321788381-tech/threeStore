"use client";

import { useEffect, useRef } from "react";
import { copyToClipboard } from "@/lib/utils";

/**
 * 正文容器。
 *
 * 关键取舍：正文 HTML 由后端保存时预渲染并经 bleach 白名单过滤，
 * 因此这里可以安全地 dangerouslySetInnerHTML；
 * 同时它是 Client Component（服务端同样会 SSR 出完整 HTML，SEO 不受影响），
 * 这样我们才能在挂载后给 <pre> 加上语言标签与复制按钮、给 <img> 挂上灯箱。
 */
export function PostContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const blocks = Array.from(root.querySelectorAll("pre"));
    blocks.forEach((pre) => {
      if (pre.dataset.enhanced === "1") return;
      pre.dataset.enhanced = "1";

      const code = pre.querySelector("code");
      const langMatch = /language-([\w+#.-]+)/.exec(code?.className || "");

      const wrapper = document.createElement("div");
      wrapper.className = "code-block";
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const bar = document.createElement("div");
      bar.className = "code-block__bar";

      if (langMatch) {
        const tag = document.createElement("span");
        tag.className = "code-block__lang";
        tag.textContent = langMatch[1];
        bar.appendChild(tag);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-block__copy";
      btn.textContent = "复制";
      btn.addEventListener("click", async () => {
        // 复用带降级的复制工具：navigator.clipboard 仅在 HTTPS / localhost 可用，
        // HTTP 站点下需走临时 textarea 兜底，否则技术博客最常用的一键复制会失效
        const ok = await copyToClipboard(code?.textContent || "");
        btn.textContent = ok ? "已复制" : "复制失败";
        setTimeout(() => {
          btn.textContent = "复制";
        }, 1500);
      });
      bar.appendChild(btn);
      wrapper.appendChild(bar);
    });

    // ---- 图片增强：懒加载 + 灯箱 ----
    // 技术文章的截图往往是全文最大的资源，且读者需要看清细节。
    // 这里做两件事：
    //   1) 补齐 loading/decoding 属性（后端 bleach 不保证保留，编辑器插入时也可能缺失）
    //   2) 挂 medium-zoom：点击放大到原图，~2KB 零依赖
    const images = Array.from(root.querySelectorAll("img"));
    images.forEach((img) => {
      if (!img.getAttribute("loading")) img.setAttribute("loading", "lazy");
      if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
      // 显式尺寸可避免图片加载完成时的布局跳动（CLS）
      if (!img.getAttribute("width") && !img.getAttribute("height")) {
        img.style.maxWidth = "100%";
      }
    });

    let zoom: { detach: () => void } | null = null;
    let cancelled = false;

    if (images.length > 0) {
      import("medium-zoom").then(({ default: mediumZoom }) => {
        // html 可能在动态导入完成前就被替换（文章内跳转），此时不应再挂载
        if (cancelled || !ref.current) return;
        zoom = mediumZoom(images, {
          // 留白让放大后的图不至于贴边，暗色下用深色遮罩
          margin: 24,
          background: "rgba(15, 23, 42, 0.92)",
          scrollOffset: 96,
        });
      });
    }

    return () => {
      cancelled = true;
      zoom?.detach();
    };
  }, [html]);

  return (
    <div
      ref={ref}
      className="prose-blog"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
