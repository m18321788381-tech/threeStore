/**
 * 富文本粘贴：把剪贴板里的 HTML 转成 Markdown。
 *
 * 为什么要做这件事：
 *   公众号时代的写作习惯是「在别处写好再粘过来」——来源往往是公众号后台、
 *   Word/WPS、网页或飞书文档。这些来源放进剪贴板的都是富文本 HTML，
 *   直接粘进 textarea 只会得到一行纯文字：标题层级、列表、加粗、链接全丢，
 *   作者得手工重排一遍。这里在粘贴时把结构转成 Markdown，粘贴即成型。
 *
 * 范围：只处理「浏览器剪贴板里真实会出现的」标签与写法，识别不了的标签
 * 按纯文本降级，不做通用 HTML → Markdown 转换器 —— 那种转换器总有覆盖不到的
 * 角落，猜错结构比不转换更让人困惑。
 */

/** 这些标签的内容对正文没有意义（或由文本分支单独处理）。 */
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "NOSCRIPT", "IFRAME",
  "SVG", "CANVAS", "FORM", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "VIDEO",
  "AUDIO", "OBJECT", "EMBED", "TEMPLATE",
]);

/** 段落级容器：前后留空行，避免相邻块被粘成一行。 */
const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE",
  "DD", "DT", "DETAILS", "SUMMARY",
]);

/** 公众号/Word 的加粗、斜体、删除线常常只写在 style 上，必须一并识别。 */
const STYLE_RULES: Array<{ test: RegExp; wrap: string }> = [
  { test: /font-weight\s*:\s*(bold|[6-9]00)/i, wrap: "**" },
  { test: /font-style\s*:\s*italic/i, wrap: "*" },
  { test: /text-decoration[^;]*line-through/i, wrap: "~~" },
];

/** 从内联 style 推断出该元素应套的行内标记。 */
function inlineStyleWraps(el: Element): string[] {
  const style = el.getAttribute("style") ?? "";
  if (!style) return [];
  return STYLE_RULES.filter((rule) => rule.test.test(style)).map((rule) => rule.wrap);
}

function wrapAll(text: string, wrappers: string[]): string {
  if (!text.trim()) return text;
  return wrappers.reduce((acc, marker) => `${marker}${acc}${marker}`, text);
}

function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const href = raw.trim();
  // javascript:/data:/vbscript: 一律拒收，避免把可执行链接带进正文
  if (!href || /^(javascript|data|vbscript):/i.test(href)) return null;
  return href;
}

function imageSrc(el: Element): string {
  // 公众号与知乎等站点用 data-src 做懒加载，src 常为空占位图
  return el.getAttribute("src") || el.getAttribute("data-src") || "";
}

function renderChildren(node: Node, depth: number): string {
  return Array.from(node.childNodes)
    .map((child) => renderNode(child, depth))
    .join("");
}

/**
 * 列表项。
 *
 * depth 的取法必须与「谁加 1」对齐：列表项自身的缩进等于**它所在列表的层级**，
 * 只有渲染「列表项的内容」时才 +1，嵌套列表才有正确的缩进。
 * 写成「渲染列表项时 +1」的直接后果是同级第二项也被缩进一格，
 * Markdown 里会变成上一项的子列表（这个 bug 在浏览器里实测出现过）。
 */
function renderListItem(el: Element, depth: number, marker: string): string {
  const indent = "  ".repeat(depth);
  const inner = renderChildren(el, depth + 1).trim().replace(/\n{2,}/g, "\n");
  // 列表项内换行（多段、二级列表）必须补同样的缩进，否则续行会掉出列表
  const body = inner.split("\n").join(`\n${indent}  `);
  return `\n${indent}${marker}${body}`;
}

function renderList(el: Element, depth: number): string {
  const marker = el.tagName === "OL" ? "1. " : "- ";
  const body = Array.from(el.children)
    .filter((child) => child.tagName === "LI")
    .map((child) => renderListItem(child, depth, marker))
    .join("");
  // 只去掉首尾换行，**不能用 trim()**：trim 会连第一个列表项的缩进一起吃掉，
  // 同级第二项就比第一项多缩进一格，在 Markdown 里会变成它的子列表
  return body ? `\n\n${body.replace(/^\n+/, "").replace(/\n+$/, "")}\n\n` : "";
}

function renderFence(el: Element): string {
  const code = (el.textContent ?? "").replace(/\n+$/, "");
  const cls = el.querySelector("code")?.getAttribute("class") ?? el.getAttribute("class") ?? "";
  const lang = /(?:language|lang)-([\w+#.-]+)/i.exec(cls)?.[1] ?? "";
  return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
}

function renderTable(el: Element): string {
  const rows = Array.from(el.querySelectorAll("tr"));
  if (!rows.length) return "";
  const cellsOf = (row: Element) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim()
    );
  const width = Math.max(1, ...rows.map((row) => cellsOf(row).length));
  const pad = (list: string[]) => [...list, ...Array(Math.max(0, width - list.length)).fill("")];
  const lines = [
    `| ${pad(cellsOf(rows[0])).join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${pad(cellsOf(row)).join(" | ")} |`),
  ];
  return `\n\n${lines.join("\n")}\n\n`;
}

function renderFigure(el: Element, depth: number): string {
  const img = el.querySelector("img");
  if (!img) return renderChildren(el, depth);
  const caption = (el.querySelector("figcaption")?.textContent ?? "").replace(/"/g, "'").trim();
  // 图注写进 title：后端渲染时会升级成 <figcaption>（见 wrap_captioned_images）
  return `\n\n![${img.getAttribute("alt") ?? ""}](${imageSrc(img)}${caption ? ` "${caption}"` : ""})\n\n`;
}

function renderNode(node: Node, depth: number): string {
  if (node.nodeType === 3) {
    // \u00a0（&nbsp;）刻意保留：公众号与 Word 里常用它做首行缩进与对齐，
    // 当成普通空格折叠掉，粘贴下来的段落缩进就没了。
    // 只折叠 HTML 源码里的换行与缩进空白（它们才是纯噪声）。
    return (node.nodeValue ?? "").replace(/[ \t\r\n]+/g, " ");
  }
  if (node.nodeType !== 1) return "";

  const el = node as Element;
  const tag = el.tagName;
  if (SKIP_TAGS.has(tag)) return "";

  if (tag === "BR") return "\n";
  if (tag === "HR") return "\n\n---\n\n";
  if (tag === "IMG") {
    const src = imageSrc(el);
    return src ? `![${el.getAttribute("alt") ?? ""}](${src})` : "";
  }
  if (tag === "PRE") return renderFence(el);
  if (tag === "CODE") return `\`${el.textContent ?? ""}\``;
  if (tag === "TABLE") return renderTable(el);
  if (tag === "FIGURE") return renderFigure(el, depth);
  if (tag === "FIGCAPTION") return ""; // 已由 FIGURE 处理
  if (tag === "UL" || tag === "OL") return renderList(el, depth);
  if (tag === "LI") return renderListItem(el, depth, "- ");

  if (tag === "BLOCKQUOTE") {
    // 空的 ">" 行表示引用块内的段落分隔：段间只需一个，多余的会让引用块里
    // 出现一长串空行（HTML 段落之间本来就带多个换行）
    const inner = renderChildren(el, depth)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const quoted = inner
      .split("\n")
      .map((line) => (line.trim() ? `> ${line.trim()}` : ">"))
      .join("\n");
    return quoted ? `\n\n${quoted}\n\n` : "";
  }

  const heading = /^H([1-6])$/.exec(tag);
  if (heading) {
    const text = renderChildren(el, depth).trim();
    if (!text) return "";
    return `\n\n${"#".repeat(Number(heading[1]))} ${text}\n\n`;
  }

  if (tag === "A") {
    const inner = renderChildren(el, depth).trim();
    const href = safeHref(el.getAttribute("href"));
    if (!href) return inner;
    return `[${inner || href}](${href})`;
  }

  const wrappers: string[] = [];
  if (tag === "STRONG" || tag === "B") wrappers.push("**");
  if (tag === "EM" || tag === "I") wrappers.push("*");
  if (tag === "DEL" || tag === "S" || tag === "STRIKE") wrappers.push("~~");
  if (!BLOCK_TAGS.has(tag)) wrappers.push(...inlineStyleWraps(el));

  const inner = renderChildren(el, depth);
  if (BLOCK_TAGS.has(tag)) {
    if (!inner.trim()) return inner;
    // 块内已经含空行（嵌了段落/列表）时不再套行内标记，否则标记会横跨一个块
    const wrapped = inner.includes("\n\n") ? inner : wrapAll(inner, wrappers);
    return `\n\n${wrapped}\n\n`;
  }
  return wrapAll(inner, wrappers);
}

/** 是否有值得转换的结构。纯文字（或只有一个 <span>）走默认粘贴更省事。 */
export function shouldConvertHtml(html: string): boolean {
  if (!html) return false;
  return /<(p|div|section|h[1-6]|ul|ol|li|blockquote|pre|table|figure|img)\b/i.test(html);
}

/** 富文本 HTML → Markdown。识别不了的标签按文本内容降级，绝不抛错。 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof window === "undefined") return "";
  let root: Element | null = null;
  try {
    root = new DOMParser().parseFromString(html, "text/html").body;
  } catch {
    return "";
  }
  if (!root) return "";

  const markdown = renderNode(root, 0);

  return markdown
    // 行尾空格：Markdown 里两个尾随空格是「硬换行」，粘贴产生的尾随空格是噪声
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}