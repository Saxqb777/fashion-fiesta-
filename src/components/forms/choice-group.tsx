"use client";

import { useState } from "react";
import { cn } from "cn";

/** Big tappable segmented choice. Better than a select on a phone. */
export function ChoiceGroup({
  name,
  label,
  options,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; tone?: "magenta" }[];
  defaultValue: string;
  hint?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setValue(o.value)}
              className={cn(
                "h-11 min-w-[88px] rounded-[10px] border px-4 text-[15px] font-semibold transition-colors",
                active
                  ? o.tone === "magenta"
                    ? "border-magenta bg-magenta text-white"
                    : "border-ink bg-ink text-paper"
                  : "border-line bg-surface text-ink hover:bg-paper-deep",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint ? <p className="text-[13px] text-ink-muted">{hint}</p> : null}
    </fieldset>
  );
}
