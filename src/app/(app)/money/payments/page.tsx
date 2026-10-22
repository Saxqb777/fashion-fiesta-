import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { customers, payments, salesOrders } from "@/db/schema";
import { SearchBox } from "@/components/data/search-box";
import { SoftTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { MoneyTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { formatISODate } from "@/lib/dates";
import { METHOD_LABEL, unallocatedByPayment } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwner();
  const { q: raw } = await searchParams;
  const q = raw?.trim() ?? "";
  const rows = await db
    .select({ p: payments, customerName: customers.name, orderNumber: salesOrders.number })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, payments.orderId))
    .where(q ? or(ilike(payments.number, likeTerm(q)), ilike(customers.name, likeTerm(q)), ilike(payments.reference, likeTerm(q))) : undefined)
    .orderBy(desc(payments.paymentDate), desc(payments.createdAt))
    .limit(300);
  const left = await unallocatedByPayment(rows.map((r) => r.p.id));
  return (
    <>
      <PageHeader
        title="Money"
        actions={
          <LinkButton href="/money/payments/new">
            <PlusIcon />
            Record payment
          </LinkButton>
        }
      />
      <MoneyTabs />
      {rows.length === 0 && !q ? (
        <EmptyState title="No payments yet" sentence="Record money as it comes in. Each payment gets a receipt you can send on WhatsApp." action={<LinkButton href="/money/payments/new">Record the first payment</LinkButton>} />
      ) : (
        <>
          <SearchBox placeholder="Search by receipt number, customer or reference" className="mb-5" />
          <ul className="flex flex-col gap-2">
            {rows.map(({ p, customerName, orderNumber }) => {
              const open = left.get(p.id) ?? 0;
              return (
                <li key={p.id}>
                  <Link href={`/money/payments/${p.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 hover:border-ink/20 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[13px] font-semibold text-ink-muted">{p.number}</span>
                        <SoftTag>{METHOD_LABEL[p.method]}</SoftTag>
                        {p.isDeposit ? <SoftTag className="border-sky/40 bg-sky/10 text-[#00739e]">Deposit {orderNumber ?? ""}</SoftTag> : null}
                        <span className="text-[12px] text-ink-muted">{formatISODate(p.paymentDate, true)}</span>
                      </div>
                      <p className="mt-1 truncate text-[16px] font-semibold">{customerName}</p>
                      {open > 0 ? <p className="text-[12px] text-ink-muted">{formatFils(open)} {p.isDeposit ? "waiting for the invoice" : "held as credit"}</p> : null}
                    </div>
                    <p className="tabular font-display text-lg font-medium">{formatFils(p.amountFils)}</p>
                    <ChevronRightIcon className="size-5 text-ink-muted/60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
