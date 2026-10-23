import type { Metadata } from "next";
import Link from "next/link";
import { ReportsHeader } from "@/components/reports/report-bits";
import { QuarterStatusControl } from "@/components/tax/quarter-status";
import { ReviewPanel } from "@/components/tax/review-panel";
import { CopyValue, TaxTabs } from "@/components/tax/tax-bits";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { pickVatPeriod } from "@/lib/report-registry";
import { requireOwner } from "@/lib/session";
import { emarataxGuide } from "@/lib/tax/emaratax";
import { periodStates } from "@/lib/tax/periods";
import { dueDateFor, vatPack, type Box, type PurchaseDoc, type SaleDoc } from "@/lib/tax/vat";
import { cn } from "cn";

export const metadata: Metadata = { title: "Tax: VAT return" };

const SECTION = { sales: "VAT on sales and all other outputs", purchases: "VAT on expenses and all other inputs", net: "Net VAT due" } as const;
const DRILL: Record<string, { title: string; kind: "sales" | "purchases" | "unclaimed" }> = {
  "1a": { title: "Behind box 1a", kind: "sales" },
  "8": { title: "Behind box 8", kind: "sales" },
  "9": { title: "Behind box 9", kind: "purchases" },
  "11": { title: "Behind box 11", kind: "purchases" },
  unclaimed: { title: "VAT paid but not claimable", kind: "unclaimed" },
};
const DOC_KIND: Record<string, SaleDoc["kind"]> = { invoice: "Tax invoice", credit: "Credit note", quick: "Quick sale" };

const amount = (fils: number | null) => (fils === null ? "" : formatFils(fils, { currency: false }));

function daysLeft(today: string, due: string) {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ q?: string; box?: string; emirate?: string; doc?: string }> }) {
  await requireOwner();
  const sp = await searchParams;
  const { periods, period } = await pickVatPeriod(sp.q);
  const today = todayISO();
  const [pack, states] = await Promise.all([vatPack(period), periodStates(periods)]);
  const state = states.get(period.start)!;
  const due = dueDateFor(period);
  const running = period.end >= today;
  const left = daysLeft(today, due);
  const box14 = pack.boxes.find((b) => b.box === "14")!;
  const guide = emarataxGuide(pack, period, formatISODate(due, true));
  const q = `q=${period.start}`;

  const drill = sp.box ? DRILL[sp.box] : undefined;
  const allSales = pack.saleDocs;
  const emirates = [...new Set(allSales.map((d) => d.emirate))].sort();
  let docs: (SaleDoc | PurchaseDoc)[] = [];
  if (drill?.kind === "sales") docs = allSales.filter((d) => (!sp.emirate || d.emirate === sp.emirate) && (!sp.doc || d.kind === DOC_KIND[sp.doc]));
  if (drill?.kind === "purchases") docs = pack.purchaseDocs.filter((d) => d.claimable);
  if (drill?.kind === "unclaimed") docs = pack.unclaimed;
  const unclaimedVat = pack.unclaimed.reduce((s, d) => s + d.vat, 0);

  return (
    <>
      <ReportsHeader
        excel="vat"
        query={q}
        actions={
          <a href={`/api/tax/vat-pack?${q}`} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper-deep" data-track="tax-pdf">
            PDF pack
          </a>
        }
      />
      <TaxTabs />

      <nav aria-label="Quarter" className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1.5">
          {periods.map((p) => {
            const st = states.get(p.start)!;
            const active = p.start === period.start;
            return (
              <li key={p.start}>
                <Link
                  href={`/reports/tax?q=${p.start}`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${p.label}, ${st.status === "filed" ? "filed" : st.status === "pack_ready" ? "pack ready" : "not started"}`}
                  className={cn("flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap", active ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:bg-paper-deep")}
                >
                  <span aria-hidden className={cn("size-2 rounded-full", st.status === "filed" ? "bg-leaf" : st.status === "pack_ready" ? "bg-sun" : active ? "border border-paper/60" : "border border-ink-muted/50")} />
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="mb-8 rounded-[14px] border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-6 sm:flex-row">
          <div>
            <p className="text-sm font-semibold text-ink-muted">
              {box14.vat! >= 0 ? "VAT to pay" : "VAT to get back"} <span className="ml-1 font-medium text-ink-muted/70">box 14</span>
            </p>
            <p className="tabular mt-2 font-display text-[2.75rem] leading-none font-medium">{formatFils(Math.abs(box14.vat!))}</p>
            <p className="mt-2 text-[14px] text-ink-muted">
              {formatISODate(period.start, true)} to {formatISODate(period.end, true)}.{" "}
              {running ? (
                <>Still running: the figures change until {formatISODate(period.end, true)}.</>
              ) : state.status === "filed" ? (
                <>Filed.</>
              ) : (
                <>
                  File and pay by <span className={cn("font-semibold", left <= 7 ? "text-brand-deep" : "text-ink")}>{formatISODate(due, true)}</span>
                  {left > 0 ? `, ${left} day${left === 1 ? "" : "s"} left.` : left === 0 ? ", today." : `, ${-left} day${left === -1 ? "" : "s"} late.`}
                </>
              )}
            </p>
          </div>
          <QuarterStatusControl periodStart={period.start} label={period.label} status={state.status} filedOn={state.filedOn} reference={state.reference} running={running} today={today} />
        </div>
      </section>

      <ReviewPanel
        periodStart={period.start}
        review={state.review}
        checkedLabel={state.reviewedAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dubai" }).format(state.reviewedAt) : null}
      />

      <section className="mb-8" aria-labelledby="boxes-title">
        <h2 id="boxes-title" className="mb-1 text-xl font-medium">
          The return, box by box
        </h2>
        <p className="mb-4 max-w-prose text-[14px] text-ink-muted">Laid out like the VAT 201 return. Tap a box with documents to see them. Every sale is in 1a, Abu Dhabi, where the shop is established.</p>
        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
          <table className="tabular w-full min-w-[600px] text-left text-[14px]">
            <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
              <tr>
                <th className="w-16 px-4 py-2.5">Box</th>
                <th className="py-2.5" />
                <th className="py-2.5 text-right">Amount, AED</th>
                <th className="py-2.5 text-right">VAT, AED</th>
                <th className="px-4 py-2.5 text-right">Adjustment</th>
              </tr>
            </thead>
            {(["sales", "purchases", "net"] as const).map((section) => (
              <tbody key={section}>
                <tr className="border-t border-line bg-paper-deep/60">
                  <th colSpan={5} className="px-4 py-2 text-[12px] font-bold text-ink-muted">
                    {SECTION[section]}
                  </th>
                </tr>
                {pack.boxes
                  .filter((b) => b.section === section)
                  .map((b) => (
                    <BoxRow key={b.box} b={b} q={q} active={sp.box === b.box} />
                  ))}
              </tbody>
            ))}
          </table>
        </div>
        {pack.unclaimed.length ? (
          <p className="mt-3 text-[14px] text-ink-muted">
            {formatFils(unclaimedVat)} VAT on {pack.unclaimed.length} purchase{pack.unclaimed.length === 1 ? "" : "s"} is left out: no supplier TRN.{" "}
            <Link href={`/reports/tax?${q}&box=unclaimed#docs`} scroll={false} className="font-semibold text-ink underline underline-offset-2">
              See them
            </Link>
          </p>
        ) : null}
      </section>

      {drill ? (
        <section id="docs" className="mb-8 scroll-mt-24" aria-labelledby="docs-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 id="docs-title" className="text-xl font-medium">
              {drill.title}: {docs.length} document{docs.length === 1 ? "" : "s"}
            </h2>
            <Link href={`/reports/tax?${q}`} scroll={false} className="text-[14px] font-semibold text-ink-muted hover:text-ink">
              Close
            </Link>
          </div>
          {drill.kind === "sales" && (emirates.length > 1 || sp.emirate || sp.doc) ? (
            <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Filter">
              {[{ key: "", label: "All emirates" }, ...emirates.map((e) => ({ key: e, label: e }))].map((e) => (
                <Link
                  key={e.key || "all"}
                  href={`/reports/tax?${q}&box=${sp.box}${e.key ? `&emirate=${encodeURIComponent(e.key)}` : ""}${sp.doc ? `&doc=${sp.doc}` : ""}#docs`}
                  scroll={false}
                  className={cn("flex h-8 items-center rounded-full border px-3 text-[13px] font-semibold", (sp.emirate ?? "") === e.key ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:bg-paper-deep")}
                >
                  {e.label}
                </Link>
              ))}
              {sp.doc ? (
                <Link href={`/reports/tax?${q}&box=${sp.box}${sp.emirate ? `&emirate=${encodeURIComponent(sp.emirate)}` : ""}#docs`} scroll={false} className="flex h-8 items-center rounded-full border border-ink bg-ink px-3 text-[13px] font-semibold text-paper">
                  Only {(DOC_KIND[sp.doc] ?? "document").toLowerCase()}s. Show all
                </Link>
              ) : null}
            </div>
          ) : null}
          {drill.kind === "sales" && sp.emirate ? <p className="mb-3 text-[13px] text-ink-muted">Filtered by delivery emirate to look at. The return still puts every sale in 1a.</p> : null}
          {docs.length ? <DocsTable docs={docs} purchases={drill.kind !== "sales"} /> : <p className="text-[14px] text-ink-muted">Nothing behind this box in {period.label}.</p>}
        </section>
      ) : null}

      <section className="mb-8" aria-labelledby="guide-title">
        <h2 id="guide-title" className="mb-1 text-xl font-medium">
          Filing on EmaraTax
        </h2>
        <p className="mb-4 max-w-prose text-[14px] text-ink-muted">Step by step, with the figure for each box beside it. Copy puts the number in the form exactly as EmaraTax wants it.</p>
        <ol className="flex flex-col gap-3">
          {guide.map((step, i) => (
            <li key={step.title} className="rounded-[14px] border border-line bg-surface p-4 sm:p-5">
              <div className="flex gap-3">
                <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-paper">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-0.5 text-[14px] text-ink-muted">{step.text}</p>
                  {step.boxes?.length ? (
                    <ul className="mt-3 divide-y divide-line rounded-[10px] border border-line">
                      {step.boxes.map((b) => (
                        <GuideBox key={b.box} b={b} />
                      ))}
                    </ul>
                  ) : null}
                  {step.check?.length ? (
                    <div className="mt-3 rounded-[10px] bg-paper-deep/70 px-3 py-2.5 text-[13px]">
                      <p className="font-bold text-ink-muted">EmaraTax fills these. Check they match:</p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {step.check.map((b) => (
                          <li key={b.box} className="tabular flex flex-wrap justify-between gap-x-4">
                            <span>
                              <span className="font-semibold">Box {b.box}</span> {b.label}
                            </span>
                            <span className="font-semibold">
                              {b.amount !== null ? `${amount(b.amount)} / ` : ""}
                              {amount(b.vat)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-ink-muted">Screen names on EmaraTax can change a little over time. The box numbers stay the same.</p>
      </section>

      <p className="mb-8 text-[13px] text-ink-muted">
        Purchases count only when the bill or expense shows VAT and the supplier&apos;s TRN. A green dot on a quarter means filed, yellow means pack ready. Quarters follow the start month in{" "}
        <Link href="/settings/money" className="font-semibold text-ink underline underline-offset-2">
          Settings, Money
        </Link>
        .
      </p>
    </>
  );
}

function BoxRow({ b, q, active }: { b: Box; q: string; active: boolean }) {
  const strong = b.box === "8" || b.box === "11";
  const label = b.docs ? (
    <Link href={active ? `/reports/tax?${q}` : `/reports/tax?${q}&box=${b.box}#docs`} scroll={false} className="font-semibold underline decoration-line decoration-2 underline-offset-4 hover:decoration-brand">
      {b.label}
    </Link>
  ) : (
    b.label
  );
  return (
    <tr className={cn("border-t border-line", strong && "font-semibold", b.box === "14" && "border-t-2 border-ink/80 font-bold", active && "bg-brand-soft/60")}>
      <td className="px-4 py-2.5 font-semibold text-ink-muted">{b.box}</td>
      <td className="py-2.5 pr-4">{label}</td>
      <td className="py-2.5 text-right">{amount(b.amount)}</td>
      <td className="py-2.5 text-right">{b.vat === null ? "" : amount(b.box === "14" ? Math.abs(b.vat) : b.vat)}</td>
      <td className="px-4 py-2.5 text-right text-ink-muted">{b.adjustment === undefined ? "" : amount(b.adjustment)}</td>
    </tr>
  );
}

/** One box as it looks on the form: the number, the label, and the figure to type with Copy. Zeros stay as they are on EmaraTax. */
function GuideBox({ b }: { b: Box }) {
  const zero = !b.amount && !b.vat;
  return (
    <li className={cn("flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center", zero && "text-ink-muted")}>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="tabular inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-[6px] border border-ink/20 px-1.5 text-[12px] font-bold text-ink">{b.box}</span>
        <span className="text-[14px]">{b.label}</span>
      </span>
      <span className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-[13rem_13rem_7rem] lg:shrink-0">
        {b.amount !== null ? <Figure label="Amount" fils={b.amount} box={b.box} /> : <span className="hidden sm:block" />}
        {b.vat !== null ? <Figure label="VAT" fils={b.vat} box={b.box} /> : <span className="hidden sm:block" />}
        <span className="tabular col-span-2 self-center text-[12px] text-ink-muted sm:col-span-1 sm:text-right">{b.adjustment !== undefined ? `Adjustment ${amount(b.adjustment)}` : ""}</span>
      </span>
    </li>
  );
}

function Figure({ label, fils, box }: { label: string; fils: number; box: string }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className={cn("tabular min-w-20 text-right text-[15px] font-semibold", fils ? "text-ink" : "text-ink-muted")}>{amount(fils)}</span>
      {fils ? <CopyValue fils={fils} label={`box ${box} ${label.toLowerCase()}`} /> : <span aria-hidden className="w-[54px] shrink-0" />}
    </span>
  );
}

function DocsTable({ docs, purchases }: { docs: (SaleDoc | PurchaseDoc)[]; purchases: boolean }) {
  const net = docs.reduce((s, d) => s + d.net, 0);
  const vat = docs.reduce((s, d) => s + d.vat, 0);
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
      <table className="tabular w-full min-w-[640px] text-left text-[14px]">
        <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
          <tr>
            <th className="px-4 py-2.5">Date</th>
            <th className="py-2.5">Document</th>
            <th className="py-2.5">{purchases ? "Supplier or payee" : "Customer"}</th>
            <th className="py-2.5">{purchases ? "TRN" : "Emirate"}</th>
            <th className="py-2.5 text-right">Before VAT</th>
            <th className="px-4 py-2.5 text-right">VAT</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={`${d.kind}-${d.id}`} className="border-t border-line">
              <td className="px-4 py-2.5 whitespace-nowrap">{formatISODate(d.date, true)}</td>
              <td className="py-2.5">
                <Link href={d.href} className="font-semibold hover:underline">
                  {d.ref}
                </Link>
                <span className="block text-[12px] text-ink-muted">{d.kind}</span>
              </td>
              <td className="py-2.5 pr-3">{d.party}</td>
              <td className="py-2.5 pr-3 text-ink-muted">{"emirate" in d ? d.emirate : (d.trn ?? <span className="font-semibold text-brand-deep">Missing</span>)}</td>
              <td className="py-2.5 text-right">{amount(d.net)}</td>
              <td className="px-4 py-2.5 text-right">{amount(d.vat)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/80 font-bold">
            <td className="px-4 py-2.5" colSpan={4}>
              Total
            </td>
            <td className="py-2.5 text-right">{amount(net)}</td>
            <td className="px-4 py-2.5 text-right">{amount(vat)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
