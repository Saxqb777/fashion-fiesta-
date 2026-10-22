import { cn } from "cn";

/** The four swoosh colours from the logo, in logo order. The one brand signature. */
export const SWOOSH = ["bg-sky", "bg-sun", "bg-leaf", "bg-magenta"] as const;

export function SwooshStripe({
  className,
  height = 3,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn("flex w-full overflow-hidden rounded-full", className)}
      style={{ height }}
    >
      {SWOOSH.map((c) => (
        <span key={c} className={cn("h-full flex-1", c)} />
      ))}
    </div>
  );
}
