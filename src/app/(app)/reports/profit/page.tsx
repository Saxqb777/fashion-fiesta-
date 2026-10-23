import type { Metadata } from "next";
import { PickRow, ReportsHeader } from "@/components/reports/report-bits";
import { pickMonth } from "@/lib/report-registry";
import { formatFils } from "@/lib/money";
import { monthName, profitAndLoss } from "@/lib/reports";
import { requireOwner } from "@/lib/session";
import { cn } from "cn";

export const metadata: Metadata = { title: "Profit and loss" };

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireOwner();
  const { months, month } = pickMonth((await searchParams).m);
  const pnl = await profitAndLoss(month);
  const profit = pnl.lines.at(-1)?.amount ?? 0;

  return (
    <>
      <ReportsHeader excel="profit" query={`m=${month}`} />
      <PickRow label="Month" items={months.map((m) => ({ href: `/reports/profit?m=${m}`, label: monthName(m), active: m === month }))} />
      <section data-guide="profit" className="max-w-2xl rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink-muted">
          Profit and loss, {monthName(month)} <span className="ml-1 font-medium text-ink-muted/70">operating profit</span>
        </p>
        <p className={cn("tabular mt-2 font-display text-[2.75rem] leading-none font-medium", profit < 0 && "text-brand")}>{formatFils(profit)}</p>
        {pnl.margin !== null ? <p className="mt-1 text-[14px] text-ink-muted">{pnl.margin}% of what came in.</p> : null}
        <dl className="tabular mt-6 flex flex-col text-[15px]">
          {pnl.lines.map((l) => (
            <div
              key={l.label}
              className={cn(
                "flex items-baseline justify-between gap-4 py-2",
                l.kind === "subtotal" && "mt-1 border-t border-line pt-3 font-semibold",
                l.kind === "total" && "mt-1 border-t-2 border-ink/80 pt-3 text-lg font-bold",
              )}
            >
              <dt className={cn(l.kind === "cost" && "pl-4 text-ink-muted")}>{l.label}</dt>
              <dd className="whitespace-nowrap">{l.kind === "cost" ? (l.amount ? `(${formatFils(-l.amount, { currency: false })})` : "0.00") : formatFils(l.amount, { currency: false })}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[13px] text-ink-muted">
          All before VAT. Fabric counts when it is taken for a task or sent to a unit, at its cost per metre, not when it is bought. Stitching units and delivery companies count on their bill date.
        </p>
      </section>
    </>
  );
}
