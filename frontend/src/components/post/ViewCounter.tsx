"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

/** 阅读量 +1：详情渲染完成后异步上报，不阻塞正文。 */
export function ViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `viewed:${slug}`;
    if (typeof window === "undefined") return;
    // 同一会话同一篇只计一次，避免刷新刷阅读量
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");

    const timer = window.setTimeout(() => {
      api.view(slug).catch(() => void 0);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [slug]);

  return null;
}
