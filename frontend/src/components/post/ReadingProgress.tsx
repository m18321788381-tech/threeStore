"use client";

import { useEffect, useRef } from "react";

/**
 * 顶部阅读进度条。
 *
 * 两种驱动方式：
 *  - 现代浏览器（Chrome 115+ / Safari 26+）：CSS `animation-timeline: scroll()`
 *    把进度动画挂到滚动时间轴上，由合成器线程执行，长文快速滚动不抖动、不占主线程。
 *  - 其余浏览器：降级为 scroll 监听 + rAF 节流，手动写 transform。
 *
 * 组件本身是纯装饰，对读屏隐藏，避免读屏用户在长文里反复听到无意义的进度播报。
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const supportsScrollTimeline =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("animation-timeline", "scroll()");

    if (supportsScrollTimeline) {
      // 交给 CSS：见 globals.css 的 .reading-progress__bar[data-mode="css"]
      el.dataset.mode = "css";
      return;
    }

    el.dataset.mode = "js";
    let raf = 0;

    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const ratio =
        scrollable > 0
          ? Math.min(1, Math.max(0, window.scrollY / scrollable))
          : 0;
      el.style.transform = `scaleX(${ratio})`;
    };

    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="reading-progress" aria-hidden="true">
      <div ref={barRef} className="reading-progress__bar" />
    </div>
  );
}
