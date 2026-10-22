import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[10px] border border-line bg-surface px-3.5 py-2 text-base text-ink transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-muted/60 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-paper-deep disabled:opacity-70 aria-invalid:border-brand-deep aria-invalid:ring-3 aria-invalid:ring-brand-deep/15",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
