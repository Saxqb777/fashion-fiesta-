import type { Metadata } from "next";
import Link from "next/link";
import { PickRow, ReportsHeader } from "@/components/reports/report-bits";
import { TaxTabs } from "@/components/tax/tax-bits";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { corporatePack, corporateYears } from "@/lib/tax/corporate";
import { cn } from "cn";

export const metadata: Metadata = { title: "Tax: corporate tax" };

export default async function CorporateTaxPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  await requireOwner();
  const years = await corporateYears();
  const asked = Number((await searchParams).y);
  const year = years.includes(asked) ? asked : years[0];
  const [pack, settings] = await Promise.all([corporatePack(year), getSettings()]);
  const q = `y=${year}`;

  return (
    <>
      <ReportsHeader
        excel="corporate"
        query={q}
        actions={
          <a href={`/api/tax/corporate?${q}`} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper-deep">
            PDF pack
          </a>
        }
      />
      <TaxTabs />
      <PickRow label="Financial year" items={years.map((y) => ({ href: `/reports/tax/corporate?y=${y}`, label: String(y), active: y === year }))} />

      <section className="mb-8 rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold text-ink-muted">Operating profit {pack.running ? "so far" : `for ${year}`}</p>
            <p className="tabular mt-2 font-display text-[2.75rem] leading-none font-medium">{formatFils(pack.profit)}</p>
            <p className="mt-2 text-[14px] text-ink-muted">
              January to December {year}. Return and any tax due by {formatISODate(pack.returnDue, true)}.
              {pack.monthsWithData < 12 && !pack.running ? ` The app holds ${pack.monthsWithData} months of this year.` : ""}
            </p>
          </div>
          <div className={cn("rounded-[10px] border p-4", pack.sbr.eligible ? "border-leaf/50 bg-leaf/10" : "border-line bg-paper-deep/60")}>
            <p className="font-semibold">{pack.sbr.headline}</p>
            <p className="mt-1 text-[14px] text-ink-muted">{pack.sbr.text}</p>
            <p className="tabular mt-3 text-[13px] text-ink-muted">Without the relief, tax on this profit would be about {formatFils(pack.taxWithoutRelief)}.</p>
          </div>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="pl-title">
        <h2 id="pl-title" className="mb-1 text-xl font-medium">
          Profit and loss, {year}
        </h2>
        <p className="mb-4 max-w-prose text-[14px] text-ink-muted">The monthly profit pages added up. Before VAT. Your accountant adds what the app does not hold, such as depreciation.</p>
        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
          <table className="tabular w-full text-left text-[14px]">
            <tbody>
              {pack.lines.map((l) => (
                <tr key={l.label} className={cn("border-t border-line first:border-t-0", l.kind === "subtotal" && "font-semibold", l.kind === "total" && "border-t-2 border-ink/80 font-bold")}>
                  <td className="px-4 py-2.5">{l.label}</td>
                  <td className="px-4 py-2.5 text-right">{formatFils(l.amount, { currency: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="acc-title">
        <h2 id="acc-title" className="mb-1 text-xl font-medium">
          For the accountant
        </h2>
        <p className="mb-4 max-w-prose text-[14px] text-ink-muted">What they will ask for. The app fills what it knows; the rest is from you.</p>
        <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
          {pack.checklist.map((c) => (
            <li key={c.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-[14px]">
              <span>{c.label}</span>
              {c.value ? <span className="tabular font-semibold">{c.value}</span> : <span className="text-ink-muted">From you</span>}
            </li>
          ))}
        </ul>
        {!settings.ctTrn ? (
          <p className="mt-3 text-[14px] text-ink-muted">
            Add the corporate tax registration number in{" "}
            <Link href="/settings/money" className="font-semibold text-ink underline underline-offset-2">
              Settings, Money
            </Link>{" "}
            so it prints on the pack.
          </p>
        ) : null}
      </section>
    </>
  );
}
