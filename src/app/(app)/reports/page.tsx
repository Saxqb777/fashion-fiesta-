import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { AgingBar, AgingLegend } from "@/components/money/bits";
import { CountUp } from "@/components/money/count-up";
import { ReportsHeader } from "@/components/reports/report-bits";
import { ReportTable } from "@/components/reports/report-table";
import { formatFils } from "@/lib/money";
import { owesReport } from "@/lib/reports";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Reports" };

export default async function OwesReportPage() {
  await requireOwner();
  const table = await owesReport();
  const t = table.totals as { notDue: number; d1_30: number; d31_60: number; d61: number; owed: number };
  const late = t.d1_30 + t.d31_60 + t.d61;

  return (
    <>
      <ReportsHeader excel={table.rows.length ? "owes" : undefined} />
      {table.rows.length ? (
        <>
          <section className="mb-6 rounded-[14px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">
              Who owes you, by how late <span className="ml-1 font-medium text-ink-muted/70">aged receivables</span>
            </p>
            <p className="mt-2 font-display text-[2.75rem] leading-none font-medium">
              <CountUp fils={t.owed} />
            </p>
            <p className="mt-2 text-[15px]">{late > 0 ? <span className="font-semibold text-brand">{formatFils(late)} is overdue.</span> : <span className="text-[#4d7a12]">Nothing overdue.</span>}</p>
            <AgingBar {...t} className="mt-4 h-3" />
            <AgingLegend />
          </section>
          <ReportTable table={table} hideTitle />
        </>
      ) : (
        <EmptyState sentence="Unpaid invoices show here, sorted by how late they are. Nothing is owed right now." action={<LinkButton href="/money/invoices" variant="outline">See invoices</LinkButton>} />
      )}
    </>
  );
}
