/**
 * 正文增强：Mermaid 图表 + KaTeX 数学公式。
 *
 * 为什么要放在一个独立模块里按需加载：
 *   mermaid 压缩后约 3.5MB，KaTeX 连同字体约 1.1MB。绝大多数文章既没有图表
 *   也没有公式，若把两者打进主包，等于让所有读者为少数文章付下载成本。
 *   这里统一做「先检测正文里有没有对应产物，再动态 import」。
 *
 * 两处约定（由后端 services/markdown.py 产出，见对应常量）：
 *   - 图表：<pre class="mermaid-block"><code>原始图形源码</code></pre>
 *   - 公式：<span class="math-inline">LaTeX</span> / <div class="math-block">LaTeX</div>
 */

const MERMAID_SELECTOR = ".mermaid-block";
const MATH_SELECTOR = ".math-inline, .math-block";

async function renderMermaid(
  root: HTMLElement,
  isCancelled: () => boolean,
  force = false
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_SELECTOR));
  if (!blocks.length) return;

  const { default: mermaid } = await import("mermaid");
  // 动态 import 与下面的渲染之间隔着一次 await，组件可能已经卸载
  if (isCancelled()) return;

  // 跟随站点主题：三个主题（清朗/纸墨/夜读）都由 <html> 上的 class 决定，
  // 这里读 CSS 变量算出的实际背景色来判断明暗，避免把主题名硬编码进来。
  const styles = getComputedStyle(document.documentElement);
  const bg = (styles.getPropertyValue("--bg") || "#ffffff").trim();
  const isDark = isDarkColor(bg);

  mermaid.initialize({
    startOnLoad: false,
    // securityLevel: strict 会让 mermaid 对图表文本做转义与消毒，
    // 正文来自本站作者，但仍是不可信输入 → 保持严格模式
    securityLevel: "strict",
    theme: isDark ? "dark" : "default",
    fontFamily: "inherit",
  });

  /* 顺序渲染，刻意不并行：mermaid.render 会往同一份全局配置和
     document.body 上的临时容器里写状态，并行调用时彼此会撞车，
     实测出现图表互相覆盖。这不是可以顺手改成 Promise.all 的性能点。 */
  for (const block of blocks) {
    if (isCancelled()) return;
    if (block.dataset.rendered === "1" && !force) continue;
    const code = block.querySelector("code");
    /* 渲染成功后 innerHTML 会被换成 SVG，原始源码就只能从 dataset 取回。
       主题切换要重画图表，因此必须先把源码留一份。 */
    const source = block.dataset.source ?? code?.textContent ?? "";
    if (!source.trim()) continue;
    block.dataset.source = source;
    block.dataset.rendered = "1";
    const renderId = `mermaid-${uid()}`;
    try {
      // 图表语法写错时 mermaid 会抛异常。此时必须保留原始源码，
      // 让作者在页面上就能看到自己写错了什么，而不是留一片空白。
      const { svg } = await mermaid.render(renderId, source);
      if (isCancelled()) return;
      block.innerHTML = svg;
      delete block.dataset.error;
    } catch {
      /* 首次渲染失败：block 里还是服务端产出的 <code>，源码天然还在。
         重渲染失败（主题切换触发）：block 里是上一轮的 SVG，<code> 已经
         没了，必须把源码补回去 —— CSS 会显示「已按原始代码展示」，
         不补的话这句话与画面对不上。 */
      if (!block.querySelector("code")) {
        const codeEl = document.createElement("code");
        codeEl.textContent = source;
        block.textContent = "";
        block.appendChild(codeEl);
      }
      block.dataset.error = "1";
    } finally {
      /* mermaid 渲染失败时会把错误图形（"炸弹"提示）挂在一个 id 为
         `d<renderId>` 的临时容器里留在 document.body 上。不清理的话，
         每个渲染失败的图表都会在页面底部堆一块错误图（实测确认它会
         脱离正文漂浮在文档流末尾）。

         注意：**只能删这个临时容器，不能删 byId(renderId)** ——
         mermaid 会把成功渲染的 SVG 根元素 id 也设成 renderId，
         删它会连带把刚刚渲染好的图表一起删掉（这正是曾经出现
         「render 返回了合法 SVG 但页面上是空白」的原因）。 */
      document.getElementById(`d${renderId}`)?.remove();
    }
  }
}

async function renderMath(
  root: HTMLElement,
  isCancelled: () => boolean
): Promise<void> {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(MATH_SELECTOR));
  if (!nodes.length) return;

  // KaTeX 的样式表由 globals.css 统一 @import（见该文件顶部）。
  // 其 @font-face 是懒加载的：没有公式的页面不会下载任何字体文件，
  // 因此不必为了省这一条 CSS 请求而去做运行期注入。
  const katex = await import("katex");
  if (isCancelled()) return;

  for (const node of nodes) {
    if (isCancelled()) return;
    if (node.dataset.rendered === "1") continue;
    node.dataset.rendered = "1";
    // textContent 取回后端转义前的原始 LaTeX
    const source = node.textContent || "";
    if (!source.trim()) continue;
    const displayMode = node.classList.contains("math-block");
    try {
      katex.default.render(source, node, {
        displayMode,
        throwOnError: false,
        // 语法错误时用红色标出问题片段，而不是整块消失
        errorColor: "var(--error)",
        strict: false,
        trust: false,
      });
    } catch {
      // throwOnError: false 已兜住大部分情况，这里只是最后一道保险
      node.dataset.error = "1";
    }
  }
}

let seq = 0;
function uid() {
  seq += 1;
  return seq;
}

/**
 * 判断颜色是否为深色（用于给 mermaid 选主题）。
 *
 * 支持 #rgb / #rrggbb / rgb() / rgba() 四种写法 —— 这也是三套主题
 * （globals.css 的 .light / .sepia / .dark）实际使用的全部格式。
 *
 * 约束：新增主题若改用 hsl() 或颜色关键字（如 `navy`）写 --bg，这里会
 * 静默走成浅色分支，导致暗色背景下图表配色发暗。改主题时请沿用上述格式。
 */
function isDarkColor(value: string): boolean {
  const text = value.trim();
  let r = 255;
  let g = 255;
  let b = 255;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const raw = hex[1];
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    r = parseInt(full.slice(0, 2), 16);
    g = parseInt(full.slice(2, 4), 16);
    b = parseInt(full.slice(4, 6), 16);
  } else {
    const rgb = /rgba?\(([^)]+)\)/i.exec(text);
    if (rgb) {
      const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
      r = Number(parts[0]) || 0;
      g = Number(parts[1]) || 0;
      b = Number(parts[2]) || 0;
    }
  }

  // ITU-R BT.601 相对亮度
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.5;
}

/**
 * 监听 <html> 上的主题 class 变化（next-themes 的 attribute="class"）。
 * 只在 class 真的变了时回调，避开其他无关的 class 抖动。
 */
function watchThemeClass(onChange: () => void): () => void {
  const target = document.documentElement;
  let last = target.className;
  const observer = new MutationObserver(() => {
    if (target.className === last) return;
    last = target.className;
    onChange();
  });
  observer.observe(target, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** 对正文容器执行全部增强。返回清理函数（供 React effect 使用）。 */
export function enhanceContent(root: HTMLElement): () => void {
  let cancelled = false;
  const isCancelled = () => cancelled;

  void renderMath(root, isCancelled).catch(() => void 0);
  void renderMermaid(root, isCancelled).catch(() => void 0);

  /* 主题切换后重画图表：mermaid 把主题色写进了 SVG 的内联样式，
     不重画的话「清朗 → 夜读」后图表仍是白底，与周围割裂。 */
  const unwatchTheme = watchThemeClass(() => {
    if (isCancelled()) return;
    void renderMermaid(root, isCancelled, true).catch(() => void 0);
  });

  return () => {
    cancelled = true;
    unwatchTheme();
  };
}
