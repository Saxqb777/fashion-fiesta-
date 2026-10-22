import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { STAGES, STAGE_LABEL, type TrackerStage } from "@/lib/stages";

/**
 * Quote → Confirmed → Stitching → Ready → Delivered → Invoiced → Paid.
 * Done stages are ink, the current one red, later ones quiet. The next action sits right under it.
 */
export function StageTracker({
  current,
  action,
  steps = STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s] })),
}: {
  current: TrackerStage | string;
  action?: React.ReactNode;
  /** Other documents (a purchase order) pass their own steps. */
  steps?: { key: string; label: string }[];
}) {
  const index = steps.findIndex((s) => s.key === current);
  return (
    <section aria-label="Order stage" className="rounded-[14px] border border-line bg-surface p-4 sm:p-5">
      <ol className="flex items-start">
        {steps.map(({ key: s, label }, i) => {
          const done = i < index;
          const now = i === index;
          return (
            <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center" aria-current={now ? "step" : undefined}>
              {i > 0 ? (
                <span aria-hidden className={cn("absolute top-[11px] right-1/2 h-0.5 w-full", i <= index ? "bg-ink" : "bg-line")} />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                  done && "border-ink bg-ink text-paper",
                  now && "size-6 border-brand bg-brand text-white ring-4 ring-brand/15",
                  !done && !now && "border-line bg-surface text-ink-muted",
                )}
              >
                {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <span
                className={cn(
                  "mt-2 hidden max-w-full truncate px-0.5 text-[12px] font-semibold sm:block",
                  now ? "text-brand" : done ? "text-ink" : "text-ink-muted",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">
          Now: <span className="font-display text-lg font-medium text-brand">{steps[index]?.label}</span>
          {index < steps.length - 1 ? <span className="ml-2">Next: {steps[index + 1].label}</span> : null}
        </p>
        {action}
      </div>
    </section>
  );
}
