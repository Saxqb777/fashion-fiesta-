import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { ReportsHeader } from "@/components/reports/report-bits";
import { ReportTable } from "@/components/reports/report-table";
import { todayISO } from "@/lib/dates";
import { tailorScorecard } from "@/lib/reports";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Tailor scorecard" };

export default async function TailorsReportPage() {
  await requireOwner();
  const table = await tailorScorecard(todayISO());

  return (
    <>
      <ReportsHeader excel={table.rows.length ? "tailors" : undefined} />
      {table.rows.length ? (
        <>
          <ReportTable table={table} />
          <p className="mt-3 max-w-prose text-[13px] text-ink-muted">
            Pieces count when you approve the task. On time means approved on or before the due date. Sent back is the share of reviews you rejected.
          </p>
        </>
      ) : (
        <EmptyState sentence="Each tailor's pieces, on time rate and work sent back show here. Add your tailors first." action={<LinkButton href="/settings/team">Add a tailor</LinkButton>} />
      )}
    </>
  );
}
