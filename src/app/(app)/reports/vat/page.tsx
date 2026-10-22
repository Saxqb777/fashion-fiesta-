import type { Metadata } from "next";
import Link from "next/link";
import { PickRow, ReportsHeader } from "@/components/reports/report-bits";
import { ReportTable } from "@/components/reports/report-table";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { pickVatPeriod } from "@/lib/report-registry";
import { vatReturn, vatTables } from "@/lib/reports";
import { requireOwner } from "@/lib/session";
import { cn } from "cn";

export const metadata: Metadata = { title: "VAT summary" };

export default async function VatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwner();
  const { periods, period } = await pickVatPeriod((await searchParams).q);
  const [v, tables] = await Promise.all([vatReturn(period), vatTables(period)]);
  const net = v.boxes.at(-1)!;

  return (
    <>
      <ReportsHeader excel="vat" query={`q=${period.start}`} />
      <PickRow label="Tax period" items={periods.map((p) => ({ href: `/reports/vat?q=${p.start}`, label: p.label, active: p.start === period.start }))} />

      <section className="mb-8 rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <p className="text-sm font-semibold text-ink-muted">
          {net.vat >= 0 ? "VAT to pay" : "VAT to get back"} <span className="ml-1 font-medium text-ink-muted/70">box 14</span>
        </p>
        <p className="tabular mt-2 font-display text-[2.75rem] leading-none font-medium">{formatFils(Math.abs(net.vat))}</p>
        <p className="mt-1 text-[14px] text-ink-muted">
          {formatISODate(period.start, true)} to {formatISODate(period.end, true)}. Laid out like the VAT 201 return on EmaraTax.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="tabular w-full min-w-[520px] text-left text-[14px]">
            <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
              <tr>
                <th className="w-14 py-2">Box</th>
                <th className="py-2" />
                <th className="py-2 text-right">Amount, AED</th>
                <th className="py-2 text-right">VAT, AED</th>
              </tr>
            </thead>
            <tbody>
              {v.boxes.map((b) => (
                <tr key={b.box} className={cn("border-t border-line", (b.box === "8" || b.box === "11") && "font-semibold", b.box === "14" && "border-t-2 border-ink/80 font-bold")}>
                  <td className="py-2.5 font-semibold text-ink-muted">{b.box}</td>
                  <td className="py-2.5 pr-4">{b.label}</td>
                  <td className="py-2.5 text-right">{b.net === null ? "" : formatFils(b.net, { currency: false })}</td>
                  <td className="py-2.5 text-right">{formatFils(b.vat, { currency: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[13px] text-ink-muted">
          Purchases count only when the bill or expense shows VAT and the supplier&apos;s TRN. Submission stays on EmaraTax. Tax periods start from the month in{" "}
          <Link href="/settings/money" className="font-semibold text-ink underline underline-offset-2">
            Settings, Money
          </Link>
          .
        </p>
      </section>

      {tables.slice(1).map((t) =>
        t.rows.length ? (
          <ReportTable key={t.title} table={t} className="mb-8" />
        ) : (
          <section key={t.title} className="mb-8">
            <h2 className="mb-2 text-xl font-medium">{t.title}</h2>
            <p className="text-[14px] text-ink-muted">Nothing in this period.</p>
          </section>
        ),
      )}
    </>
  );
}
