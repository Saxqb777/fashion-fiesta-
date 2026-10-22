import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PickRow, ReportsHeader } from "@/components/reports/report-bits";
import { ReportTable } from "@/components/reports/report-table";
import { todayISO } from "@/lib/dates";
import { customersTable } from "@/lib/reports";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Customer health" };

export default async function CustomersReportPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOwner();
  const quiet = (await searchParams).show === "quiet";
  const table = await customersTable(todayISO(), quiet);

  return (
    <>
      <ReportsHeader excel={table.rows.length ? "customers" : undefined} query={quiet ? "show=quiet" : undefined} />
      <PickRow
        label="Which customers"
        items={[
          { href: "/reports/customers", label: "Everyone who ordered", active: !quiet },
          { href: "/reports/customers?show=quiet", label: "Quiet for 90 days", active: quiet },
        ]}
      />
      {table.rows.length ? (
        <>
          <ReportTable table={table} hideTitle />
          <p className="mt-3 max-w-prose text-[13px] text-ink-muted">Days to pay is the average from invoice date to the payment that cleared it.</p>
        </>
      ) : quiet ? (
        <EmptyState sentence="Every customer has ordered in the last 90 days." />
      ) : (
        <EmptyState sentence="Each customer's last order, value this year and days to pay show here once orders are confirmed." action={<LinkButton href="/orders/new">New order</LinkButton>} />
      )}
    </>
  );
}
