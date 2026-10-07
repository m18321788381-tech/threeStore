import type { ReactNode, SVGProps } from "react";

/**
 * 编辑器工具栏图标。
 *
 * 为什么自带一套 SVG 而不引入图标库：这里只要 15 个图标，而一个图标库
 * （lucide/react-icons）会给整站 bundle 增加几十 KB。图标统一走
 * currentColor + 1.7px 描边，在三套主题下自动跟随文字色，不需要额外适配。
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function UndoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 5 4 10l5 5" />
      <path d="M4 10h9a6 6 0 0 1 6 6v1" />
    </Icon>
  );
}

export function RedoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M15 5l5 5-5 5" />
      <path d="M20 10h-9a6 6 0 0 0-6 6v1" />
    </Icon>
  );
}

export function BulletListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function OrderedListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <text x="2" y="8.6" fontSize="7" fill="currentColor" stroke="none">
        1
      </text>
      <text x="2" y="14.6" fontSize="7" fill="currentColor" stroke="none">
        2
      </text>
      <text x="2" y="20.6" fontSize="7" fill="currentColor" stroke="none">
        3
      </text>
    </Icon>
  );
}

export function TaskListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <path d="M4.8 7.8l1.7 1.7 2.7-3.2" />
      <path d="M12 6h9M12 12h9M12 18h9" />
      <rect x="3" y="14.5" width="6.5" height="6.5" rx="1.5" />
    </Icon>
  );
}

export function QuoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 5v14" />
      <path d="M10 8h9M10 12h9M10 16h6" />
    </Icon>
  );
}

export function CodeBlockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M13.5 4 10.5 20" />
      <path d="M8 8.5 4.5 12 8 15.5" />
      <path d="M16 8.5 19.5 12 16 15.5" />
    </Icon>
  );
}

export function DividerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 12h18" />
      <path d="M6 7h12" strokeDasharray="2 3" />
      <path d="M6 17h12" strokeDasharray="2 3" />
    </Icon>
  );
}

export function TableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 10h18M9.5 10v9.5" />
    </Icon>
  );
}

export function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18.5 9 14l3.5 3 3-2.5 4.5 4" />
    </Icon>
  );
}

export function LinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
    </Icon>
  );
}

export function EmojiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <circle cx="9.2" cy="9.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="9.8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ExpandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 3H5.5A2.5 2.5 0 0 0 3 5.5V8" />
      <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
      <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
      <path d="M16 21h2.5a2.5 2.5 0 0 0 2.5-2.5V16" />
    </Icon>
  );
}

export function CollapseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 8h2.5A2.5 2.5 0 0 0 8 5.5V3" />
      <path d="M21 8h-2.5A2.5 2.5 0 0 1 16 5.5V3" />
      <path d="M3 16h2.5A2.5 2.5 0 0 1 8 18.5V21" />
      <path d="M21 16h-2.5a2.5 2.5 0 0 0-2.5 2.5V21" />
    </Icon>
  );
}

export function KeyboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8" />
    </Icon>
  );
}