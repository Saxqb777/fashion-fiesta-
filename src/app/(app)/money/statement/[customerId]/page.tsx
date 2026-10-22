import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { BackLink } from "@/components/data/detail";
import { TierTag } from "@/components/data/tags";
import { LinkButton } from "@/components/link-button";
import { AgingBar } from "@/components/money/bits";
import { CountUp } from "@/components/money/count-up";
import { SendDoc } from "@/components/money/send-doc";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDaysISO, formatISODate, todayISO } from "@/lib/dates";
import { sendDocProps } from "@/lib/doc-links";
import { agingByCustomer, statementLedger } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { cn } from "cn";

export const metadata: Metadata = { title: "Statement" };

const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function StatementPage({ params, searchParams }: { params: Promise<{ customerId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireOwner();
  const { customerId } = await params;
  const q = await searchParams;
  const customer = /^[0-9a-f-]{36}$/.test(customerId) ? await db.query.customers.findFirst({ where: eq(customers.id, customerId) }) : undefined;
  if (!customer) notFound();
  const end = iso(q.to) ?? todayISO();
  const start = iso(q.from) ?? addDaysISO(end, -90);
  const [ledger, [aging], s] = await Promise.all([statementLedger(customerId, start, end), agingByCustomer(customerId), getSettings()]);
  const query = `?from=${start}&to=${end}`;
  const send = await sendDocProps("statement", customerId, {
    phone: customer.phone,
    filename: `Statement ${customer.name} ${end}`,
    query,
    message: `${s.tradeName}: your statement of account to ${formatISODate(end, true)}. ${ledger.closing > 0 ? `Balance due ${formatFils(ledger.closing)}.` : ledger.closing < 0 ? `${formatFils(-ledger.closing)} credit on account.` : "Nothing is due."} Thank you.`,
  });
  const late = aging ? aging.d1_30 + aging.d31_60 + aging.d61 : 0;

  return (
    <>
      <BackLink href={`/customers/${customerId}`} label={customer.name} />
      <PageHeader
        eyebrow="Statement of account"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {customer.name}
            {customer.tier === "vip" ? <TierTag tier="vip" /> : null}
          </span>
        }
      />

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-muted">{ledger.closing >= 0 ? `Balance on ${formatISODate(end, true)}` : `Credit on account on ${formatISODate(end, true)}`}</p>
          <p className="mt-1 font-display text-[2.5rem] leading-none font-medium sm:text-[3rem]">
            <CountUp fils={Math.abs(ledger.closing)} />
          </p>
          {late > 0 ? <p className="mt-2 text-[15px] font-semibold text-brand">{formatFils(late)} is overdue.</p> : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {ledger.closing > 0 ? <LinkButton href={`/money/payments/new?customer=${customerId}`}>Record payment</LinkButton> : null}
          <SendDoc {...send} />
        </div>
      </section>

      {aging && aging.owed > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Not due", aging.notDue, ""],
              ["1 to 30 days late", aging.d1_30, ""],
              ["31 to 60 days late", aging.d31_60, ""],
              ["Over 60 days late", aging.d61, "border-brand"],
            ] as const
          ).map(([label, v, tone]) => (
            <div key={label} className={cn("rounded-[14px] border border-line bg-surface px-4 py-3", v > 0 && tone)}>
              <p className="text-[12px] font-semibold text-ink-muted">{label}</p>
              <p className={cn("tabular mt-0.5 text-[16px] font-semibold", v > 0 && tone && "text-brand-deep")}>{formatFils(v)}</p>
            </div>
          ))}
          <AgingBar notDue={aging.notDue} d1_30={aging.d1_30} d31_60={aging.d31_60} d61={aging.d61} className="col-span-full mt-1" />
        </div>
      ) : null}

      <form className="mt-6 flex flex-wrap items-end gap-3" action={`/money/statement/${customerId}`}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={start} className="w-[170px]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={end} className="w-[170px]" />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      <section className="mt-4 overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="tabular hidden grid-cols-[100px_120px_1fr_120px_120px_130px] gap-3 border-b border-line bg-paper-deep/50 px-5 py-2.5 text-[12px] font-bold tracking-wide text-ink-muted uppercase md:grid">
          <span>Date</span>
          <span>Document</span>
          <span>Details</span>
          <span className="text-right">Charges</span>
          <span className="text-right">Payments</span>
          <span className="text-right">Balance</span>
        </div>
        <div className="tabular flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-[14px] md:grid md:grid-cols-[100px_120px_1fr_120px_120px_130px] md:px-5">
          <span className="text-ink-muted md:order-none">
            <span className="md:hidden">Brought forward, </span>
            {formatISODate(start, true)}
          </span>
          <span className="hidden md:block" />
          <span className="hidden md:block">Balance brought forward</span>
          <span className="hidden md:block" />
          <span className="hidden md:block" />
          <span className="text-right font-semibold">{formatFils(ledger.opening)}</span>
        </div>
        {ledger.rows.length ? (
          <ul className="divide-y divide-line">
            {ledger.rows.map((e, i) => (
              <li key={`${e.doc}-${i}`}>
                <Link href={e.href} className="tabular block px-4 py-3 text-[14px] hover:bg-paper-deep/50 md:grid md:grid-cols-[100px_120px_1fr_120px_120px_130px] md:items-center md:gap-3 md:px-5">
                  <span className="hidden text-ink-muted md:block">{formatISODate(e.date, true)}</span>
                  <span className="hidden font-semibold md:block">{e.doc}</span>
                  <span className="hidden md:block">{e.text}</span>
                  <span className="hidden text-right md:block">{e.debit ? formatFils(e.debit) : ""}</span>
                  <span className="hidden text-right text-[#4d7a12] md:block">{e.credit ? formatFils(-e.credit) : ""}</span>
                  <span className="hidden text-right font-semibold md:block">{formatFils(e.balance)}</span>
                  <span className="flex items-baseline justify-between gap-3 md:hidden">
                    <span className="font-semibold">{e.doc}</span>
                    <span className={e.credit ? "font-semibold text-[#4d7a12]" : "font-semibold"}>{e.debit ? `+ ${formatFils(e.debit)}` : `- ${formatFils(e.credit)}`}</span>
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] text-ink-muted md:hidden">
                    <span className="min-w-0">
                      {formatISODate(e.date, true)} · {e.text}
                    </span>
                    <span className="shrink-0">Balance {formatFils(e.balance)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-[14px] text-ink-muted">Nothing moved between these dates.</p>
        )}
      </section>
    </>
  );
}
