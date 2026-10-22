import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { ReportsHeader } from "@/components/reports/report-bits";
import { ReportTable } from "@/components/reports/report-table";
import { todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { salesByCustomer, salesByMonth } from "@/lib/reports";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Sales report" };

export default async function SalesReportPage() {
  await requireOwner();
  const today = todayISO();
  const [months, customers] = await Promise.all([salesByMonth(today), salesByCustomer(today)]);
  const values = months.rows.map((r) => Number(r.total));
  const max = Math.max(...values, 0);

  return (
    <>
      <ReportsHeader excel={max > 0 ? "sales" : undefined} />
      {max > 0 ? (
        <>
          <section className="mb-8 rounded-[14px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">Sales by month, before VAT</p>
            <p className="tabular mt-1 font-display text-3xl">{formatFils(Number(months.totals?.total ?? 0))}</p>
            <p className="text-[13px] text-ink-muted">Last 12 months: tax invoices less credit notes, plus quick sales.</p>
            <ol className="mt-5 flex h-44 items-end gap-[2px]" aria-label="Sales by month">
              {months.rows.map((r) => {
                const v = Number(r.total);
                return (
                  <li key={String(r.month)} className="group relative flex h-full flex-1 flex-col justify-end" aria-label={`${r.month}: ${formatFils(v)}`}>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-paper group-hover:block">
                      {r.month}: {formatFils(v)}
                    </span>
                    <span className="block rounded-t-[4px] bg-brand transition-colors group-hover:bg-brand-deep" style={{ height: v > 0 ? `${Math.max(2, (v / max) * 100)}%` : "0" }} />
                  </li>
                );
              })}
            </ol>
            <ol className="mt-2 flex gap-[2px] border-t border-line pt-1.5 text-[10px] font-semibold text-ink-muted" aria-hidden>
              {months.rows.map((r) => (
                <li key={String(r.month)} className="flex-1 text-center">
                  {String(r.month).slice(0, 3)}
                </li>
              ))}
            </ol>
          </section>
          <ReportTable table={months} className="mb-8" />
          {customers.rows.length ? <ReportTable table={customers} /> : null}
        </>
      ) : (
        <EmptyState sentence="Sales show here month by month once you issue tax invoices or make quick sales." action={<LinkButton href="/orders">Go to orders</LinkButton>} />
      )}
    </>
  );
}
