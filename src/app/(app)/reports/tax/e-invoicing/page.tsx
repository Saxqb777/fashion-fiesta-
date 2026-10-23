import type { Metadata } from "next";
import Link from "next/link";
import { PickRow, ReportsHeader } from "@/components/reports/report-bits";
import { TaxTabs } from "@/components/tax/tax-bits";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { pickVatPeriod } from "@/lib/report-registry";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { einvoiceDocs, sellerIssues, type Issue } from "@/lib/tax/einvoice";
import { cn } from "cn";

export const metadata: Metadata = { title: "Tax: e-invoicing" };

function state(issues: Issue[]) {
  return issues.some((i) => i.level === "missing") ? "missing" : issues.length ? "check" : "ready";
}
const WORD = { ready: "Ready", check: "Check", missing: "Missing details" } as const;
const DOT = { ready: "bg-leaf", check: "bg-sun", missing: "bg-brand" } as const;

export default async function EInvoicingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwner();
  const { periods, period } = await pickVatPeriod((await searchParams).q);
  const [docs, settings] = await Promise.all([einvoiceDocs(period), getSettings()]);
  const shop = sellerIssues(settings);
  const ready = docs.filter((d) => state(d.issues) === "ready").length;
  const missing = docs.filter((d) => state(d.issues) === "missing").length;

  return (
    <>
      <ReportsHeader
        actions={
          docs.length ? (
            <a href={`/api/tax/einvoices?q=${period.start}`} className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper-deep">
              Download quarter, zip
            </a>
          ) : undefined
        }
      />
      <TaxTabs />

      <section className="mb-8 rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-ink-muted">E-invoicing starts for the shop on</p>
            <p className="mt-2 font-display text-[2.25rem] leading-none font-medium">1 July 2027</p>
            <p className="mt-2 max-w-prose text-[14px] text-ink-muted">
              For businesses under AED 50 million a year. Before then, choose an accredited service provider (by 31 March 2027). From that day every business Tax Invoice and Credit Note goes through them. Here each one is ready as a Peppol PINT AE file they can take. Check the latest dates on mof.gov.ae.
            </p>
          </div>
          <div className="rounded-[10px] border border-line bg-paper-deep/60 p-4">
            <p className="font-semibold">The shop&apos;s own details</p>
            {shop.length ? (
              <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
                {shop.map((i) => (
                  <li key={i.text} className="flex gap-2">
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", i.level === "missing" ? "bg-brand" : "bg-sun")} />
                    {i.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[14px] text-ink-muted">TRN, trade licence and address are in place.</p>
            )}
            {shop.length ? (
              <Link href="/settings/money" className="mt-3 inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold hover:bg-paper-deep">
                Open Settings, Money
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <PickRow label="Quarter" items={periods.map((p) => ({ href: `/reports/tax/e-invoicing?q=${p.start}`, label: p.label, active: p.start === period.start }))} />

      <section className="mb-8" aria-labelledby="docs-title">
        <h2 id="docs-title" className="mb-1 text-xl font-medium">
          {docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} in ${period.label}` : `Nothing in ${period.label}`}
        </h2>
        {docs.length ? (
          <>
            <p className="mb-2 text-[14px] text-ink-muted">
              {ready} ready{missing ? `, ${missing} missing details` : ""}. Fix a customer&apos;s TRN, address or branch emirate on the customer page; the file picks it up at once.
            </p>
            <ul className="mb-4 flex flex-col gap-0.5 text-[13px] text-ink-muted">
              <li>
                <span className="font-semibold text-brand-deep">No address</span>: an e-invoice needs the customer&apos;s street and city.
              </li>
              <li>
                <span className="font-semibold text-ink">No customer TRN</span>: fine for a customer who is not VAT registered. Only invoices to registered businesses go through e-invoicing first.
              </li>
              <li>
                <span className="font-semibold text-ink">No emirate</span>: Abu Dhabi is used until the branch has one.
              </li>
            </ul>
            <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface">
              {docs.map((d) => {
                const st = state(d.issues);
                return (
                  <li key={`${d.kind}-${d.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <Link href={d.href} className="font-semibold hover:underline">
                          {d.number}
                        </Link>
                        <span className="text-[13px] text-ink-muted">
                          {d.kind === "credit" ? "Credit note" : "Tax invoice"}, {formatISODate(d.date, true)}, {d.customer}
                        </span>
                      </p>
                      {d.issues.length ? (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {d.issues.map((i) => (
                            <li key={i.text} title={i.text} className={cn("rounded-full border px-2.5 py-0.5 text-[12px] font-semibold", i.level === "missing" ? "border-brand/30 bg-brand-soft text-brand-deep" : "border-line text-ink-muted")}>
                              {i.tag ?? i.text}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <span className="tabular w-28 shrink-0 text-right text-[14px] font-semibold">{formatFils(d.total)}</span>
                    <span className="inline-flex w-36 shrink-0 items-center gap-1.5 text-[12px] font-bold tracking-wide text-ink-muted uppercase">
                      <span aria-hidden className={cn("size-2 rounded-full", DOT[st])} />
                      {WORD[st]}
                    </span>
                    <a href={`/api/tax/xml?kind=${d.kind}&id=${d.id}`} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3.5 text-[13px] font-semibold hover:bg-paper-deep">
                      XML file
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-[14px] text-ink-muted">Tax invoices and credit notes from this quarter show here, each ready as an e-invoice file.</p>
        )}
      </section>

      <p className="mb-8 max-w-prose text-[13px] text-ink-muted">
        Files follow Peppol PINT AE 1.0.1. The provider checks every file before it goes to the FTA, and adds item codes for goods and services. Walk in quick sales are not business invoices and are not in this list.
      </p>
    </>
  );
}
