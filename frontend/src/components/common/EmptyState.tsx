import { cn } from "@/lib/utils";

export function EmptyState({
  title = "这里还是空的",
  description,
  icon = "◍",
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center",
        className
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full border border-border text-xl text-muted">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      )}
      {action}
    </div>
  );
}
