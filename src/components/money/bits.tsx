import { cn } from "cn";
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/ledger";
import { formatFils } from "@/lib/money";

const pill = "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-bold tracking-wide uppercase";

export function InvoiceStatusTag({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <span
      className={cn(
        pill,
        status === "paid" && "border-leaf/50 bg-leaf/15 text-[#4d7a12]",
        status === "credited" && "border-line bg-surface text-ink-muted",
        status === "part_paid" && "border-sky/40 bg-sky/10 text-[#00739e]",
        status === "overdue" && "border-brand bg-brand text-white",
        status === "unpaid" && "border-sun/70 bg-sun/20 text-ink",
        className,
      )}
    >
      {INVOICE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The ageing strip: one bar per customer, green for not yet due, yellow up to 30 days late,
 * magenta up to 60, red beyond. Width is the share of what they owe.
 */
export function AgingBar({ notDue, d1_30, d31_60, d61, className }: { notDue: number; d1_30: number; d31_60: number; d61: number; className?: string }) {
  const total = notDue + d1_30 + d31_60 + d61;
  if (total <= 0) return null;
  const parts: [number, string, string][] = [
    [notDue, "bg-leaf", "Not due"],
    [d1_30, "bg-sun", "1 to 30 days late"],
    [d31_60, "bg-magenta", "31 to 60 days late"],
    [d61, "bg-brand", "Over 60 days late"],
  ];
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-paper-deep", className)} role="img" aria-label={parts.filter(([v]) => v > 0).map(([v, , l]) => `${l}: ${formatFils(v)}`).join(", ")}>
      {parts.map(([v, c, l]) => (v > 0 ? <span key={l} className={cn("h-full", c)} style={{ width: `${(v / total) * 100}%` }} title={`${l}: ${formatFils(v)}`} /> : null))}
    </div>
  );
}

export function AgingLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-muted">
      {[
        ["bg-leaf", "Not due"],
        ["bg-sun", "1 to 30 days late"],
        ["bg-magenta", "31 to 60"],
        ["bg-brand", "Over 60"],
      ].map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", c)} />
          {l}
        </li>
      ))}
    </ul>
  );
}
