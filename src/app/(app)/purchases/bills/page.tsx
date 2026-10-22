import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, ilike, or } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { purchaseOrders, supplierBills, suppliers } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { DueChip } from "@/components/orders/bits";
import { PageHeader } from "@/components/page-header";
import { BillStatusTag } from "@/components/purchases/bits";
import { PurchasesTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { billFigures, billLabel, billStatus } from "@/lib/payables";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Supplier bills" };

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const rows = await db
    .select({ b: supplierBills, supplierName: suppliers.name, poNumber: purchaseOrders.number })
    .from(supplierBills)
    .innerJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, supplierBills.poId))
    .where(q ? or(ilike(supplierBills.billNumber, likeTerm(q)), ilike(suppliers.name, likeTerm(q)), ilike(purchaseOrders.number, likeTerm(q))) : undefined)
    .orderBy(desc(supplierBills.billDate), desc(supplierBills.createdAt))
    .limit(300);
  const figures = await billFigures(rows.map((r) => r.b.id));
  const today = todayISO();
  const all = rows.map((r) => ({ ...r, f: figures.get(r.b.id)!, status: billStatus(figures.get(r.b.id)!, r.b.dueDate, today) }));
  const shown = all.filter((r) => (params.show === "open" ? r.f.balanceFils > 0 : params.show === "overdue" ? r.status === "overdue" : params.show === "paid" ? r.status === "paid" : true));
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
      {rows.length === 0 && !q ? (
        <EmptyState title="No supplier bills yet" sentence="Enter a supplier's invoice when it arrives, from the purchase order or on its own." action={<LinkButton href="/purchases/bills/new">Enter the first bill</LinkButton>} />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by their invoice number, supplier or PO" />
            <FilterChips
              base="/purchases/bills"
              params={params}
              name="show"
              options={[
                { label: "All" },
                { value: "open", label: "Not paid", count: all.filter((r) => r.f.balanceFils > 0).length },
                { value: "overdue", label: "Late", count: all.filter((r) => r.status === "overdue").length },
                { value: "paid", label: "Paid" },
              ]}
            />
          </div>
          {shown.length ? (
            <ul className="flex flex-col gap-2">
              {shown.map(({ b, supplierName, poNumber, f, status }) => (
                <li key={b.id}>
                  <Link href={`/purchases/bills/${b.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 hover:border-ink/20 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[13px] font-semibold text-ink-muted">{billLabel(b)}</span>
                        <BillStatusTag status={status} />
                        {f.balanceFils > 0 ? <DueChip date={b.dueDate} /> : null}
                        <span className="text-[12px] text-ink-muted">
                          {formatISODate(b.billDate, true)}
                          {poNumber ? ` · ${poNumber}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[16px] font-semibold">{supplierName}</p>
                    </div>
                    <div className="tabular text-right">
                      <p className="text-[15px] font-semibold">{formatFils(b.totalFils)}</p>
                      {f.balanceFils > 0 && f.balanceFils !== b.totalFils ? <p className="text-[12px] font-semibold text-brand-deep">{formatFils(f.balanceFils)} left</p> : null}
                    </div>
                    <ChevronRightIcon className="size-5 text-ink-muted/60" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState sentence={q ? `No bill matches "${q}".` : "No bills here."} action={<LinkButton href="/purchases/bills" variant="outline">Show all bills</LinkButton>} />
          )}
        </>
      )}
    </>
  );
}
