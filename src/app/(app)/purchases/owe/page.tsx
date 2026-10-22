import type { Metadata } from "next";
import Link from "next/link";
import { count } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { db } from "@/db";
import { supplierBills } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { AgingBar, AgingLegend } from "@/components/money/bits";
import { CountUp } from "@/components/money/count-up";
import { PageHeader } from "@/components/page-header";
import { PurchasesTabs } from "@/components/section-navs";
import { formatISODate } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { agingBySupplier } from "@/lib/payables";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Who you owe" };

export default async function WhoYouOwePage() {
  await requireOwner();
  const [rows, [{ n: billCount }]] = await Promise.all([agingBySupplier(), db.select({ n: count() }).from(supplierBills)]);
  const owing = rows.filter((r) => r.owed > 0);
  const total = owing.reduce((s, r) => s + r.owed, 0);
  const overdue = owing.reduce((s, r) => s + r.d1_30 + r.d31_60 + r.d61, 0);
  const sums = owing.reduce((a, r) => ({ notDue: a.notDue + r.notDue, d1_30: a.d1_30 + r.d1_30, d31_60: a.d31_60 + r.d31_60, d61: a.d61 + r.d61 }), { notDue: 0, d1_30: 0, d31_60: 0, d61: 0 });

  return (
    <>
      <PageHeader
        title="Purchases"
        actions={
          <LinkButton href="/purchases/bills/new">
            <PlusIcon />
            Enter a bill
          </LinkButton>
        }
      />
      <PurchasesTabs />
      {billCount === 0 ? (
        <EmptyState
          title="You owe nobody yet"
          sentence="Supplier bills show here until you pay them. If you owed suppliers before you started using the app, enter those first."
          action={<LinkButton href="/settings/opening">Enter opening balances</LinkButton>}
        />
      ) : (
        <>
          <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">
              Who you owe <span className="ml-1 font-medium text-ink-muted/70">accounts payable</span>
            </p>
            <p className="mt-2 font-display text-[2.75rem] leading-none font-medium sm:text-[3.5rem]">
              <CountUp fils={total} />
            </p>
            <p className="mt-2 text-[15px]">
              {overdue > 0 ? <span className="font-semibold text-brand">{formatFils(overdue)} is past the pay by date.</span> : <span className="text-[#4d7a12]">Nothing late.</span>}{" "}
              <span className="text-ink-muted">
                {owing.length} {owing.length === 1 ? "supplier" : "suppliers"}.
              </span>
            </p>
            <AgingBar {...sums} className="mt-4 h-3" />
            <AgingLegend />
          </section>
          {owing.length ? (
            <ul className="mt-6 flex flex-col gap-2">
              {owing.map((r) => {
                const late = r.d1_30 + r.d31_60 + r.d61;
                return (
                  <li key={r.supplierId} className="rounded-[14px] border border-line bg-surface px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/purchases/suppliers/${r.supplierId}`} className="text-[16px] font-semibold hover:underline">
                          {r.name}
                        </Link>
                        <p className="text-[13px] text-ink-muted">
                          {late > 0 ? <span className="font-semibold text-brand-deep">{formatFils(late)} late. </span> : null}
                          {r.oldestDue ? `Oldest due ${formatISODate(r.oldestDue, true)}.` : ""}
                          {r.advance > 0 ? ` ${formatFils(r.advance)} paid in advance.` : ""}
                        </p>
                      </div>
                      <p className="tabular font-display text-xl font-medium">{formatFils(r.owed)}</p>
                      <LinkButton href={`/purchases/payments/new?supplier=${r.supplierId}`} variant={late ? "default" : "outline"} size="sm">
                        Pay
                      </LinkButton>
                    </div>
                    <AgingBar notDue={r.notDue} d1_30={r.d1_30} d31_60={r.d31_60} d61={r.d61} className="mt-3" />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState className="mt-6" sentence="Every bill is paid. New bills show here until you pay them." action={<LinkButton href="/purchases/bills" variant="outline">See all bills</LinkButton>} />
          )}
          <p className="mt-6">
            <Link href="/purchases/bills" className="text-[15px] font-semibold text-brand hover:underline">
              All bills
            </Link>
          </p>
        </>
      )}
    </>
  );
}
