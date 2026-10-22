"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { switchMode } from "@/actions/practice";
import { cn } from "cn";
import { reloadInto } from "./track";

/** Live or Practice. A full reload after, so nothing from the other shop lingers on screen. */
export function ModeSwitch({ practice, className }: { practice: boolean; className?: string }) {
  const [pending, start] = useTransition();
  const [going, setGoing] = useState<"live" | "practice" | null>(null);
  const go = (to: "live" | "practice") => {
    if ((to === "practice") === practice || pending) return;
    setGoing(to);
    start(async () => {
      const res = await switchMode(to);
      if (res.error) {
        toast.error(res.error);
        setGoing(null);
        return;
      }
      reloadInto("/today");
    });
  };
  return (
    <div role="radiogroup" aria-label="Shop mode" className={cn("flex h-9 items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 text-[13px] font-semibold", className)}>
      {(["live", "practice"] as const).map((m) => {
        const on = (m === "practice") === practice;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => go(m)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3.5 transition-colors",
              on ? (m === "practice" ? "bg-brand text-white" : "bg-ink text-paper") : "text-ink-muted hover:text-ink",
            )}
          >
            {going === m ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            {m === "live" ? "Live" : "Practice"}
          </button>
        );
      })}
    </div>
  );
}
