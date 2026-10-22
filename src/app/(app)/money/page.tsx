import type { Metadata } from "next";
import Link from "next/link";
import { count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { TierTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { AgingBar, AgingLegend } from "@/components/money/bits";
import { CountUp } from "@/components/money/count-up";
import { EmailStatements } from "@/components/money/email-statements";
import { PageHeader } from "@/components/page-header";
import { MoneyTabs } from "@/components/section-navs";
import { formatISODate, todayISO } from "@/lib/dates";
import { agingByCustomer } from "@/lib/ledger";
import { emailReady } from "@/lib/email";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Who owes you" };

export default async function WhoOwesYouPage() {
  await requireOwner();
  const [rows, [{ n: invoiceCount }]] = await Promise.all([agingByCustomer(), db.select({ n: count() }).from(invoices)]);
  const owing = rows.filter((r) => r.owed > 0);
  const total = owing.reduce((s, r) => s + r.owed, 0);
  const overdue = owing.reduce((s, r) => s + r.d1_30 + r.d31_60 + r.d61, 0);
  const sums = owing.reduce((a, r) => ({ notDue: a.notDue + r.notDue, d1_30: a.d1_30 + r.d1_30, d31_60: a.d31_60 + r.d31_60, d61: a.d61 + r.d61 }), { notDue: 0, d1_30: 0, d31_60: 0, d61: 0 });
  const today = todayISO();
  const emails = owing.length
    ? new Map((await db.select({ id: customers.id, email: customers.email }).from(customers).where(inArray(customers.id, owing.map((r) => r.customerId)))).map((c) => [c.id, c.email]))
    : new Map<string, string | null>();

  return (
    <>
      <PageHeader
        title="Money"
        actions={
          owing.length ? (
            <EmailStatements
              ready={emailReady()}
              rows={owing.map((r) => ({ id: r.customerId, name: r.name, email: emails.get(r.customerId) ?? null, owed: r.owed, late: r.d1_30 + r.d31_60 + r.d61 }))}
            />
          ) : undefined
        }
      />
      <MoneyTabs />
      {invoiceCount === 0 ? (
        <EmptyState
          title="Nobody owes you anything yet"
          sentence="Invoices you issue show here until they are paid. If customers already owed you before you started using the app, enter those first."
          action={<LinkButton href="/settings/opening">Enter opening balances</LinkButton>}
        />
      ) : (
        <>
          <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">
              Who owes you <span className="ml-1 font-medium text-ink-muted/70">accounts receivable</span>
            </p>
            <p className="mt-2 font-display text-[2.75rem] leading-none font-medium sm:text-[3.5rem]">
              <CountUp fils={total} />
            </p>
            <p className="mt-2 text-[15px]">
              {overdue > 0 ? <span className="font-semibold text-brand">{formatFils(overdue)} is overdue.</span> : <span className="text-[#4d7a12]">Nothing overdue.</span>}{" "}
              <span className="text-ink-muted">{owing.length} {owing.length === 1 ? "customer" : "customers"}.</span>
            </p>
            <AgingBar {...sums} className="mt-4 h-3" />
            <AgingLegend />
          </section>

          {owing.length ? (
            <ul className="mt-6 flex flex-col gap-2">
              {owing.map((r) => {
                const late = r.d1_30 + r.d31_60 + r.d61;
                return (
                  <li key={r.customerId} className="rounded-[14px] border border-line bg-surface px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/customers/${r.customerId}`} className="flex items-center gap-2 text-[16px] font-semibold hover:underline">
                          {r.name}
                          {r.tier === "vip" ? <TierTag tier="vip" /> : null}
                        </Link>
                        <p className="text-[13px] text-ink-muted">
                          {late > 0 ? <span className="font-semibold text-brand-deep">{formatFils(late)} late. </span> : null}
                          {r.oldestDue ? `Oldest due ${formatISODate(r.oldestDue, true)}${r.oldestDue < today ? "" : ""}.` : ""}
                          {r.credit > 0 ? ` ${formatFils(r.credit)} paid in advance.` : ""}
                        </p>
                      </div>
                      <p className="tabular font-display text-xl font-medium">{formatFils(r.owed)}</p>
                      <div className="flex gap-2">
                        <LinkButton href={`/money/statement/${r.customerId}`} variant="ghost" size="sm">
                          Statement
                        </LinkButton>
                        <LinkButton href={`/money/payments/new?customer=${r.customerId}`} variant={late ? "default" : "outline"} size="sm">
                          Record payment
                        </LinkButton>
                      </div>
                    </div>
                    <AgingBar notDue={r.notDue} d1_30={r.d1_30} d31_60={r.d31_60} d61={r.d61} className="mt-3" />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState className="mt-6" sentence="Everyone has paid. New invoices show here until they are paid." action={<LinkButton href="/money/invoices" variant="outline">See invoices</LinkButton>} />
          )}
        </>
      )}
    </>
  );
}
