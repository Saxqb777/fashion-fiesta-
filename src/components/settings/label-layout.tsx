"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveLabelLayout } from "@/actions/settings";
import { LABEL_PRESETS } from "@/lib/label-layouts";
import { cn } from "cn";

export function LabelLayoutPicker({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Label sheet">
      {LABEL_PRESETS.map((l, i) => (
        <button
          key={l.name}
          type="button"
          role="radio"
          aria-checked={value === l.name}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const before = value;
              setValue(l.name);
              const res = await saveLabelLayout(i);
              if (res.error) {
                setValue(before);
                toast.error(res.error);
              } else toast.success(`Labels print on: ${l.name}.`);
            })
          }
          className={cn("flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left", value === l.name ? "border-ink bg-paper-deep/60" : "border-line hover:bg-paper-deep/40")}
        >
          <span className={cn("size-4 rounded-full border-2", value === l.name ? "border-[5px] border-ink" : "border-line")} />
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">{l.name}</span>
            <span className="tabular text-[13px] text-ink-muted">
              {l.cols * l.rows === 1 ? "One label per page" : `${l.cols} across, ${l.rows} down`}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
