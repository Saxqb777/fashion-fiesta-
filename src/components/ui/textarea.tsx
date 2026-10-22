import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-base text-ink transition-colors outline-none placeholder:text-ink-muted/60 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:bg-paper-deep disabled:opacity-70 aria-invalid:border-brand-deep aria-invalid:ring-3 aria-invalid:ring-brand-deep/15",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
