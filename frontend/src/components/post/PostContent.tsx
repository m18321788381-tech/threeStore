"use client";

import { useEffect, useRef } from "react";
import { copyToClipboard } from "@/lib/utils";

/**
 * 正文容器。
 *
 * 关键取舍：正文 HTML 由后端保存时预渲染并经 bleach 白名单过滤，
 * 因此这里可以安全地 dangerouslySetInnerHTML；
 * 同时它是 Client Component（服务端同样会 SSR 出完整 HTML，SEO 不受影响），
 * 这样我们才能在挂载后给 <pre> 加上语言标签与复制按钮。
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
  }, [html]);

  return (
    <div
      ref={ref}
      className="prose-blog"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
