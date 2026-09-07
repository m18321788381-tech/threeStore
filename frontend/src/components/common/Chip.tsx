import Link from "next/link";
import { cn } from "@/lib/utils";

export function Chip({
  href,
  children,
  count,
  active = false,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  count?: number;
  active?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <span>{children}</span>
      {count !== undefined && (
        <span className="text-[10px] opacity-60">{count}</span>
      )}
    </>
  );

  const styles = cn(
    "chip",
    active && "chip-active",
    className
  );

  if (!href) return <span className={styles}>{content}</span>;
  return (
    <Link href={href} className={styles}>
      {content}
    </Link>
  );
}
