"use client";

import { usePathname } from "next/navigation";
import { cn } from "cn";
import { SETUP_STEPS } from "@/lib/defaults";

const LABELS: Record<(typeof SETUP_STEPS)[number], string> = {
  account: "You",
  shop: "Shop",
  money: "Money",
  numbering: "Numbers",
  team: "Team",
};

/** Five segments in the swoosh colours plus brand red. Fills as steps complete. */
const COLOURS = ["bg-sky", "bg-sun", "bg-leaf", "bg-magenta", "bg-brand"];

export function SetupProgress() {
  const pathname = usePathname();
  const current = pathname.split("/")[2] ?? "account";
  const index = current === "done" ? SETUP_STEPS.length : Math.max(0, SETUP_STEPS.indexOf(current as never));
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Setup progress">
      {SETUP_STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={step} className="flex flex-col gap-1.5">
            <span
              className={cn(
                "h-1.5 rounded-full transition-colors duration-300",
                done || active ? COLOURS[i] : "bg-line",
                active && "animate-pulse",
              )}
            />
            <span className={cn("text-[11px] font-semibold tracking-wide uppercase", active ? "text-ink" : "text-ink-muted")}>
              {LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
