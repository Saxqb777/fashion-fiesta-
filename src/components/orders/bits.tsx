import { CalendarIcon } from "lucide-react";
import { cn } from "cn";
import type { OrderStage, TaskStatus } from "@/db/schema";
import { dueLabel } from "@/lib/dates";
import { STAGE_LABEL, TASK_STATUS_LABEL } from "@/lib/stages";

const pill = "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold tracking-wide uppercase";

export function DueChip({ date, done, className }: { date: string | null | undefined; done?: boolean; className?: string }) {
  const due = dueLabel(date);
  if (!due) return null;
  return (
    <span
      className={cn(
        pill,
        "normal-case tracking-normal",
        done
          ? "border-line bg-surface text-ink-muted"
          : due.tone === "overdue"
            ? "border-brand bg-brand text-white"
            : due.tone === "today"
              ? "border-sun bg-sun/30 text-ink"
              : due.tone === "soon"
                ? "border-sun/60 bg-sun/15 text-ink"
                : "border-line bg-surface text-ink-muted",
        className,
      )}
    >
      <CalendarIcon className="size-3" />
      {due.text}
    </span>
  );
}

export function TaskStatusTag({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        pill,
        status === "assigned" && "border-line bg-surface text-ink-muted",
        status === "in_progress" && "border-sky/40 bg-sky/10 text-[#00739e]",
        status === "submitted" && "border-magenta/30 bg-magenta/10 text-magenta",
        status === "approved" && "border-leaf/50 bg-leaf/15 text-[#4d7a12]",
        status === "rejected" && "border-brand/30 bg-brand-soft text-brand-deep",
        status === "declined" && "border-brand/30 bg-brand-soft text-brand-deep",
        className,
      )}
    >
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function StageTag({ stage }: { stage: OrderStage | "quote" }) {
  return (
    <span
      className={cn(
        pill,
        stage === "ready" && "border-leaf/50 bg-leaf/15 text-[#4d7a12]",
        stage === "stitching" && "border-sky/40 bg-sky/10 text-[#00739e]",
        stage === "confirmed" && "border-ink/20 bg-paper-deep text-ink",
        stage === "draft" && "border-dashed border-ink/30 bg-surface text-ink-muted",
        (stage === "delivered" || stage === "invoiced" || stage === "paid") && "border-line bg-surface text-ink-muted",
        stage === "cancelled" && "border-brand/30 bg-brand-soft text-brand-deep",
        stage === "quote" && "border-line bg-surface text-ink",
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** "18 of 25" with a bar. Approved part solid, done but not approved lighter. */
export function Progress({ done, approved = 0, total, className, size = "md" }: { done: number; approved?: number; total: number; className?: string; size?: "sm" | "md" }) {
  const pct = (n: number) => `${total ? Math.min(100, (n / total) * 100) : 0}%`;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative flex-1 overflow-hidden rounded-full bg-paper-deep", size === "sm" ? "h-1.5" : "h-2.5")}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink/25 transition-[width] duration-500" style={{ width: pct(done) }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-leaf transition-[width] duration-500" style={{ width: pct(approved) }} />
      </div>
      <span className="tabular shrink-0 text-[13px] font-semibold text-ink">
        {done} <span className="font-medium text-ink-muted">of {total}</span>
      </span>
    </div>
  );
}

export function MeasurementGrid({ values, className }: { values: { name: string; value: string }[]; className?: string }) {
  if (!values.length) return null;
  return (
    <dl className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}>
      {values.map((v) => (
        <div key={v.name} className="rounded-[10px] bg-paper-deep/70 px-3 py-2">
          <dt className="truncate text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{v.name}</dt>
          <dd className="tabular font-display text-xl leading-tight font-medium">{v.value}</dd>
        </div>
      ))}
    </dl>
  );
}
