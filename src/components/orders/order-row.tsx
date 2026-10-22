import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { TierTag } from "@/components/data/tags";
import type { CustomerTier, OrderStage } from "@/db/schema";
import { formatFils } from "@/lib/money";
import { orderNo } from "@/lib/stages";
import { DueChip, Progress, StageTag } from "./bits";

export function OrderRow({
  o,
}: {
  o: {
    id: string;
    number: string | null;
    customerPoNumber: string | null;
    stage: OrderStage;
    dueDate: string | null;
    totalFils: number;
    customerName: string;
    customerTier: CustomerTier;
    pieces: number;
    done: number;
    approved: number;
  };
}) {
  const open = ["confirmed", "stitching", "ready"].includes(o.stage);
  return (
    <li>
      <Link href={`/orders/${o.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 transition-colors hover:border-ink/20 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-[13px] font-semibold text-ink-muted">{orderNo(o.number)}</span>
            {o.customerPoNumber ? <span className="tabular text-[12px] text-ink-muted">Customer PO {o.customerPoNumber}</span> : null}
            <StageTag stage={o.stage} />
            {open ? <DueChip date={o.dueDate} done={o.stage === "ready"} /> : null}
          </div>
          <p className="mt-1 flex items-center gap-2 truncate text-[16px] font-semibold">
            {o.customerName}
            {o.customerTier === "vip" ? <TierTag tier="vip" /> : null}
          </p>
          {open && o.pieces ? <Progress done={o.done} approved={o.approved} total={o.pieces} size="sm" className="mt-2 max-w-sm" /> : null}
        </div>
        <p className="tabular hidden shrink-0 text-right text-[15px] font-semibold sm:block">{formatFils(o.totalFils)}</p>
        <ChevronRightIcon className="size-5 shrink-0 text-ink-muted/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
