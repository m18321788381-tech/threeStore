/**
 * Markdown 编辑器文本操作层。
 *
 * 为什么单独成模块：工具栏、快捷键、Enter 自动续写列表、`[[ ]]` 补全全都需要
 * 「按行/按选区改文本」，这类逻辑写在组件里会立刻变成一团交叉的 setState 与
 * selectionStart 读写 —— 而 selection 是异步生效的（React 重渲染后才落到 DOM），
 * 顺序稍错就出现「点了工具栏光标跑掉」。这里全部实现为**纯函数**：
 * 文本进、文本 + 新选区出，不碰 DOM、不读全局状态，组件只负责把结果写回。
 *
 * 约定：所有函数的入参选区都是 textarea 的 selectionStart/selectionEnd，
 * 返回的 start/end 可以直接赋回去。
 */

export type Sel = { start: number; end: number };
export type EditResult = { value: string; start: number; end: number };

/** 选区覆盖的整行范围（不含行尾换行符）。 */
export function lineBounds(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const index = value.indexOf("\n", Math.max(end, from));
  return { from, to: index === -1 ? value.length : index };
}

/** 选区起点落在第几行（相对整篇文本）。 */
function lineOf(value: string, pos: number): number {
  let line = 0;
  for (let i = 0; i < pos && i < value.length; i += 1) {
    if (value[i] === "\n") line += 1;
  }
  return line;
}

/**
 * 对选区覆盖的每一行做前缀变换，并把选区按各行的长度差整体平移。
 *
 * 平移而不是「重新选中整块」是刻意的：点一下「加粗/标题」就把整行选中，
 * 用户接着敲字会覆盖掉刚改的行 —— 工具栏按钮不应该吞掉输入焦点语义。
 */
export function mapLines(value: string, sel: Sel, transform: (line: string) => string): EditResult {
  const { from, to } = lineBounds(value, sel.start, sel.end);
  const lines = value.slice(from, to).split("\n");
  const startLine = lineOf(value, sel.start) - lineOf(value, from);
  const endLine = lineOf(value, sel.end) - lineOf(value, from);

  let deltaStart = 0;
  let deltaEnd = 0;
  const next: string[] = [];
  lines.forEach((line, index) => {
    const updated = transform(line);
    if (index === startLine) deltaStart = updated.length - line.length;
    if (index === endLine) deltaEnd = updated.length - line.length;
    next.push(updated);
  });

  const block = next.join("\n");
  const nextValue = value.slice(0, from) + block + value.slice(to);
  const maxPos = from + block.length;
  return {
    value: nextValue,
    start: Math.min(Math.max(sel.start + deltaStart, from), maxPos),
    end: Math.min(Math.max(sel.end + deltaEnd, from), maxPos),
  };
}

/** 用一对标记包裹选区（标记留在选区外侧，便于连续输入）。 */
export function wrapSelection(value: string, sel: Sel, before: string, after: string): EditResult {
  const selected = value.slice(sel.start, sel.end);
  const nextValue = value.slice(0, sel.start) + before + selected + after + value.slice(sel.end);
  return {
    value: nextValue,
    start: sel.start + before.length,
    end: sel.start + before.length + selected.length,
  };
}

/** 行内标记的开关：已包裹则去掉，否则包上。 */
export function toggleInline(value: string, sel: Sel, marker: string): EditResult {
  const { start, end } = sel;
  const selected = value.slice(start, end);
  const size = marker.length;

  // 选区本身带着标记（**文字**）：直接去掉
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, selected.length - size);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  // 标记在选区外侧（**|文字|**）：一并去掉
  if (value.slice(start - size, start) === marker && value.slice(end, end + size) === marker) {
    return {
      value: value.slice(0, start - size) + selected + value.slice(end + size),
      start: start - size,
      end: start - size + selected.length,
    };
  }
  return wrapSelection(value, sel, marker, marker);
}

/** 标题层级：level = 0 表示正文；重复点击同一层级等于取消。 */
export function setHeading(value: string, sel: Sel, level: number): EditResult {
  const { from, to } = lineBounds(value, sel.start, sel.end);
  const lines = value.slice(from, to).split("\n");
  const existing = /^(#{1,6})\s+/.exec(lines[0] ?? "");
  const sameLevel = existing ? existing[1].length === level : false;

  return mapLines(value, sel, (line) => {
    const body = line.replace(/^(#{1,6})\s+/, "");
    if (level === 0 || sameLevel) return body;
    return `${"#".repeat(level)} ${body}`;
  });
}

export type ListKind = "ul" | "ol" | "task";

const LIST_PATTERNS: Record<ListKind, RegExp> = {
  ul: /^[-*+]\s+/,
  ol: /^\d+[.)]\s+/,
  task: /^[-*+]\s+\[[ xX]\]\s+/,
};
const LIST_PREFIX: Record<ListKind, string> = {
  ul: "- ",
  ol: "1. ",
  task: "- [ ] ",
};

/** 列表开关：整块已是该类型则取消，否则整体替换成该类型（含引用块）。 */
export function toggleList(value: string, sel: Sel, kind: ListKind): EditResult {
  const { from, to } = lineBounds(value, sel.start, sel.end);
  const lines = value.slice(from, to).split("\n");
  const active = lines.every((line) => line.trim() === "" || LIST_PATTERNS[kind].test(line));

  return mapLines(value, sel, (line) => {
    const body = line.replace(/^(\s*)(?:(?:[-*+]\s+\[[ xX]\]\s+)|(?:[-*+]\s+)|(?:\d+[.)]\s+))/, "$1");
    return active ? body : `${LIST_PREFIX[kind]}${body.trimStart()}`;
  });
}

/** 引用开关。 */
export function toggleQuote(value: string, sel: Sel): EditResult {
  const { from, to } = lineBounds(value, sel.start, sel.end);
  const lines = value.slice(from, to).split("\n");
  const active = lines.every((line) => line.trim() === "" || /^>\s?/.test(line));

  return mapLines(value, sel, (line) => {
    if (active) return line.replace(/^>\s?/, "");
    return `> ${line.trimStart()}`;
  });
}

/**
 * 在选区处插入块级内容（代码块 / 分割线 / 表格 / 图片）。
 *
 * 前后补换行是必要的：Markdown 的块级语法只有在行首才生效，
 * 否则「插入表格」会变成往当前段落中间塞一行管道符。
 */
export function insertBlock(value: string, sel: Sel, block: string, caretOffset?: number): EditResult {
  const needsLeading = sel.start > 0 && value[sel.start - 1] !== "\n";
  const needsTrailing = sel.end < value.length && value[sel.end] !== "\n";
  const prefix = needsLeading ? "\n" : "";
  const suffix = needsTrailing ? "\n" : "";
  const nextValue = value.slice(0, sel.start) + prefix + block + suffix + value.slice(sel.end);
  const anchor = sel.start + prefix.length + (caretOffset ?? block.length);
  return { value: nextValue, start: anchor, end: anchor };
}

/** 围栏代码块；选中内容会成为代码，光标落在代码首行（空块）或块尾。 */
export function insertCodeBlock(value: string, sel: Sel, lang = ""): EditResult {
  const body = value.slice(sel.start, sel.end);
  const fence = `\`\`\`${lang}`;
  const block = `${fence}\n${body}\n\`\`\``;
  // 空块时光标放在语言标记之后、代码行之前，直接开写
  const caret = body ? undefined : fence.length + 1;
  return insertBlock(value, sel, block, caret);
}

/** 生成 GFM 表格（cols 列、rows 行数据行）。 */
export function buildTable(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => ` 列 ${i + 1} `).join("|");
  const divider = Array.from({ length: cols }, () => " --- ").join("|");
  const body = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "  ").join("|")
  );
  return [`|${header}|`, `|${divider}|`, ...body.map((r) => `|${r}|`)].join("\n");
}

/** 图片：alt 是给读屏与搜素引擎的说明，caption 会渲染成图注（见后端 wrap_captioned_images）。 */
export function buildImage(url: string, alt: string, caption: string): string {
  const safeAlt = alt.replace(/[[\]]/g, "");
  const safeCaption = caption.replace(/"/g, "'");
  return safeCaption ? `![${safeAlt}](${url} "${safeCaption}")` : `![${safeAlt}](${url})`;
}

/** 链接：有选中文字则作为链接文本，否则用占位文字并选中它，方便直接改写。 */
export function buildLink(value: string, sel: Sel, url: string, fallbackText = "链接文字"): EditResult {
  const selected = value.slice(sel.start, sel.end);
  const text = selected || fallbackText;
  const snippet = `[${text}](${url})`;
  const nextValue = value.slice(0, sel.start) + snippet + value.slice(sel.end);
  if (selected) {
    const anchor = sel.start + snippet.length;
    return { value: nextValue, start: anchor, end: anchor };
  }
  // 无选中：把占位文字选中，用户敲字即替换
  return { value: nextValue, start: sel.start + 1, end: sel.start + 1 + text.length };
}

/** 双向链接：[[标题]] 或 [[标题|显示文本]]。 */
export function insertWikiLink(value: string, sel: Sel, title: string, alias?: string): EditResult {
  const selected = value.slice(sel.start, sel.end);
  const label = alias?.trim() || selected.trim();
  const snippet = label ? `[[${title}|${label}]]` : `[[${title}]]`;
  const nextValue = value.slice(0, sel.start) + snippet + value.slice(sel.end);
  const anchor = sel.start + snippet.length;
  return { value: nextValue, start: anchor, end: anchor };
}

/** 缩进/反缩进：列表内调整层级；围栏代码块内则调整代码缩进。 */
export function indentLines(value: string, sel: Sel, outdent: boolean): EditResult {
  const { from, to } = lineBounds(value, sel.start, sel.end);
  const insideFence = isInsideFence(value, sel.start);
  if (insideFence) {
    if (outdent) {
      // 只吃掉行首最多两个空格，避免把代码的语义缩进整段推平
      const lineStart = from;
      const spaces = /^ {1,2}/.exec(value.slice(lineStart, sel.start))?.[0].length ?? 0;
      if (!spaces) return { value, start: sel.start, end: sel.end };
      const nextValue = value.slice(0, lineStart) + value.slice(lineStart + spaces);
      return { value: nextValue, start: sel.start - spaces, end: sel.end - spaces };
    }
    const nextValue = value.slice(0, sel.start) + "  " + value.slice(sel.end);
    return { value: nextValue, start: sel.start + 2, end: sel.end + 2 };
  }

  return mapLines(value, sel, (line) => {
    if (!line.trim()) return line;
    if (outdent) return line.replace(/^ {1,2}/, "").replace(/^\t/, "");
    return `  ${line}`;
  });
}

/** Enter 键续写列表项 / 引用；返回 null 表示交给浏览器默认行为。 */
export function continueListOnEnter(value: string, sel: Sel): EditResult | null {
  if (sel.start !== sel.end) return null;
  const { from, to } = lineBounds(value, sel.start, sel.end);
  if (sel.start !== to) return null; // 光标在行中：只换行，不制造半截标记

  const line = value.slice(from, sel.start);
  const matched = /^([ \t]*)(- \[[ xX]\]\s|[-*+]\s|\d+[.)]\s|>\s?)/.exec(line);
  if (!matched) return null;

  const indent = matched[1] ?? "";
  const marker = matched[2] ?? "";

  // 空条目再回车 = 退出列表（去掉标记，而不是新增一个空条目）
  if (!line.slice(indent.length + marker.length).trim()) {
    const nextValue = value.slice(0, from) + value.slice(sel.start);
    return { value: nextValue, start: from, end: from };
  }

  const numbered = /^(\d+)[.)]\s$/.exec(marker);
  const nextMarker = numbered
    ? `${Number(numbered[1]) + 1}. `
    : marker.startsWith("- [")
      ? "- [ ] "
      : marker;

  const inserted = `\n${indent}${nextMarker}`;
  const nextValue = value.slice(0, sel.start) + inserted + value.slice(sel.end);
  const anchor = sel.start + inserted.length;
  return { value: nextValue, start: anchor, end: anchor };
}

/** 光标是否位于围栏代码块内部（用于 Tab 缩进与工具栏状态）。 */
export function isInsideFence(value: string, pos: number): boolean {
  const before = value.slice(0, pos);
  const fences = before.match(/^\s*(```|~~~)/gm);
  return Boolean(fences && fences.length % 2 === 1);
}

export type ActiveState = {
  heading: number;
  list: ListKind | null;
  quote: boolean;
  fence: boolean;
  marks: { bold: boolean; italic: boolean; strike: boolean; code: boolean };
};

/** 光标处的格式状态，用于工具栏高亮。只依赖选区前后各若干字符，不解析全篇。 */
export function detectActive(value: string, sel: Sel): ActiveState {
  const { from } = lineBounds(value, sel.start, sel.end);
  const line = value.slice(from, value.indexOf("\n", from) === -1 ? value.length : value.indexOf("\n", from));

  const heading = /^(#{1,6})\s+/.exec(line)?.[1]?.length ?? 0;
  const list: ListKind | null = LIST_PATTERNS.task.test(line)
    ? "task"
    : LIST_PATTERNS.ol.test(line)
      ? "ol"
      : LIST_PATTERNS.ul.test(line)
        ? "ul"
        : null;
  const quote = /^>\s?/.test(line);

  const selected = value.slice(sel.start, sel.end);
  const backticksBeforeCaret = (value.slice(from, sel.start).match(/`/g) ?? []).length;
  const wrapped = (marker: string) =>
    (selected.length >= marker.length * 2 &&
      selected.startsWith(marker) &&
      selected.endsWith(marker)) ||
    (value.slice(sel.start - marker.length, sel.start) === marker &&
      value.slice(sel.end, sel.end + marker.length) === marker);

  // 行内代码：包裹标记成对出现，或当前行光标之前有奇数个反引号（即已开未闭）
  const code = wrapped("`") || backticksBeforeCaret % 2 === 1;

  return {
    heading,
    list,
    quote,
    fence: isInsideFence(value, sel.start),
    marks: {
      bold: wrapped("**"),
      italic: wrapped("*") && !wrapped("**"),
      strike: wrapped("~~"),
      code,
    },
  };
}

/**
 * 检测光标是否处于一个「未闭合的 [[ ]]」中，用于标题补全。
 * 返回 from（`[[` 的起点）与已输入片段 query。
 */
export function detectWikiQuery(value: string, caret: number): { from: number; query: string } | null {
  const lineStart = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const before = value.slice(lineStart, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const fragment = before.slice(open + 2);
  // 已经写完、跨行、或已经在写别名时不再提示
  if (fragment.includes("]]") || fragment.includes("|") || fragment.includes("[") || fragment.includes("\n")) {
    return null;
  }
  return { from: lineStart + open, query: fragment.trim() };
}

/** 按片段过滤候选标题：前缀匹配优先，其次是包含匹配。 */
export function matchTitles(titles: string[], query: string, limit = 8): string[] {
  const keyword = query.trim().toLowerCase();
  const unique = Array.from(new Set(titles.filter(Boolean)));
  if (!keyword) return unique.slice(0, limit);
  const prefix = unique.filter((t) => t.toLowerCase().startsWith(keyword));
  const contains = unique.filter(
    (t) => !prefix.includes(t) && t.toLowerCase().includes(keyword)
  );
  return [...prefix, ...contains].slice(0, limit);
}

export type TextStats = {
  chars: number;
  charsNoSpace: number;
  words: number;
  paragraphs: number;
  images: number;
  links: number;
  minutes: number;
};

/**
 * 写作统计。字数口径与后端 estimate_reading_time 保持一致（中文按字、英文按词），
 * 这样状态栏的「约 N 分钟」与文章页显示的阅读时长不会出现两个数字。
 *
 * 段落按「空行分隔的块」计数：列表、表格各算一段，与人在编辑器里数段落的方式一致；
 * 若按非空行数，一个十行的列表会显示成「10 段」，反而误导。
 */
export function textStats(value: string): TextStats {
  const text = value || "";
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) ?? []).length;
  return {
    chars: text.length,
    charsNoSpace: text.replace(/\s/g, "").length,
    words: cjk + words,
    paragraphs: text.split(/\n{2,}/).filter((block) => block.trim()).length,
    images: (text.match(/!\[[^\]]*\]\(/g) ?? []).length,
    // 负向断言排除图片语法，否则每张图都会被算成一条链接
    links: (text.match(/(?<!!)\[[^\]]*\]\(/g) ?? []).length,
    minutes: Math.max(1, Math.round(cjk / 400 + words / 220)),
  };
}