import { cn } from "cn";
import { BILL_STATUS_LABEL, type BillStatus, type PoStage } from "@/lib/payables";

const pill = "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-bold tracking-wide uppercase";

const PO_LABEL: Record<PoStage, string> = { draft: "Draft", sent: "Sent", received: "Received", billed: "Billed", paid: "Paid", cancelled: "Cancelled" };

export function PoStageTag({ stage, className }: { stage: PoStage; className?: string }) {
  return (
    <span
      className={cn(
        pill,
        stage === "draft" && "border-dashed border-ink/30 text-ink-muted",
        stage === "sent" && "border-sky/40 bg-sky/10 text-[#00739e]",
        stage === "received" && "border-sun/70 bg-sun/20 text-ink",
        stage === "billed" && "border-magenta/40 bg-magenta/10 text-magenta",
        stage === "paid" && "border-leaf/50 bg-leaf/15 text-[#4d7a12]",
        stage === "cancelled" && "border-line text-ink-muted line-through",
        className,
      )}
    >
      {PO_LABEL[stage]}
    </span>
  );
}

export function BillStatusTag({ status, className }: { status: BillStatus; className?: string }) {
  return (
    <span
      className={cn(
        pill,
        status === "paid" && "border-leaf/50 bg-leaf/15 text-[#4d7a12]",
        status === "part_paid" && "border-sky/40 bg-sky/10 text-[#00739e]",
        status === "overdue" && "border-brand bg-brand text-white",
        status === "unpaid" && "border-sun/70 bg-sun/20 text-ink",
        className,
      )}
    >
      {BILL_STATUS_LABEL[status]}
    </span>
  );
}
