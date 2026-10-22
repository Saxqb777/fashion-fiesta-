import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import { db } from "@/db";
import { customers, invoices } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { InvoiceStatusTag } from "@/components/money/bits";
import { DueChip } from "@/components/orders/bits";
import { PageHeader } from "@/components/page-header";
import { MoneyTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { formatISODate, todayISO } from "@/lib/dates";
import { invoiceFigures, invoiceStatus } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const rows = await db
    .select({ i: invoices, customerName: customers.name })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(q ? or(ilike(invoices.number, likeTerm(q)), ilike(customers.name, likeTerm(q)), ilike(invoices.customerPoNumber, likeTerm(q))) : undefined))
    .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt))
    .limit(300);
  const figures = await invoiceFigures(rows.map((r) => r.i.id));
  const today = todayISO();
  const withStatus = rows.map((r) => ({ ...r, f: figures.get(r.i.id)!, status: invoiceStatus(figures.get(r.i.id)!, r.i.dueDate, today) }));
  const show = params.show;
  const filtered = withStatus.filter((r) =>
    show === "open" ? r.f.balanceFils > 0 : show === "overdue" ? r.status === "overdue" : show === "paid" ? r.status === "paid" || r.status === "credited" : true,
  );

  return (
    <>
      <PageHeader title="Money" />
      <MoneyTabs />
      {rows.length === 0 && !q ? (
        <EmptyState
          title="No invoices yet"
          sentence="Invoices are made from an order. Open a delivered order and tap Make invoice."
          action={<LinkButton href="/orders?view=ready">Orders ready to deliver</LinkButton>}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by invoice number, customer or Customer PO" />
            <FilterChips
              base="/money/invoices"
              params={params}
              name="show"
              options={[
                { label: "All" },
                { value: "open", label: "Not paid", count: withStatus.filter((r) => r.f.balanceFils > 0).length },
                { value: "overdue", label: "Overdue", count: withStatus.filter((r) => r.status === "overdue").length },
                { value: "paid", label: "Paid" },
              ]}
            />
          </div>
          {filtered.length ? (
            <ul className="flex flex-col gap-2">
              {filtered.map(({ i, customerName, f, status }) => (
                <li key={i.id}>
                  <Link href={`/money/invoices/${i.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 hover:border-ink/20 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[13px] font-semibold text-ink-muted">{i.kind === "opening_balance" ? "Opening balance" : i.number}</span>
                        <InvoiceStatusTag status={status} />
                        {f.balanceFils > 0 ? <DueChip date={i.dueDate} /> : null}
                        <span className="text-[12px] text-ink-muted">{formatISODate(i.invoiceDate, true)}</span>
                      </div>
                      <p className="mt-1 truncate text-[16px] font-semibold">{customerName}</p>
                    </div>
                    <div className="tabular text-right">
                      <p className="text-[15px] font-semibold">{formatFils(i.totalFils)}</p>
                      {f.balanceFils > 0 && f.balanceFils !== i.totalFils ? <p className="text-[12px] font-semibold text-brand-deep">{formatFils(f.balanceFils)} left</p> : null}
                    </div>
                    <ChevronRightIcon className="size-5 text-ink-muted/60" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState sentence={q ? `No invoice matches "${q}".` : "No invoices here."} action={<LinkButton href="/money/invoices" variant="outline">Show all invoices</LinkButton>} />
          )}
        </>
      )}
    </>
  );
}
