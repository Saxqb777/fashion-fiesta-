import { cn } from "cn";

/** Empty states teach: one sentence and one button. Never an empty table. */
export function EmptyState({
  title,
  sentence,
  action,
  className,
}: {
  title?: React.ReactNode;
  sentence: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-line bg-surface/60 px-5 py-6 md:px-6 md:py-8",
        className,
      )}
    >
      {title ? <h2 className="text-xl font-medium text-ink">{title}</h2> : null}
      <p className="max-w-prose text-[15px] text-ink-muted">{sentence}</p>
      {action}
    </div>
  );
}
