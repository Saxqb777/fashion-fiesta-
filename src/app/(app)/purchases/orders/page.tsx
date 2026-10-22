import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { db } from "@/db";
import { purchaseOrders, salesOrders, suppliers } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { PoStageTag } from "@/components/purchases/bits";
import { PurchasesTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { formatISODate, todayISO } from "@/lib/dates";
import { formatFils } from "@/lib/money";
import { poSummaries, type PoStage } from "@/lib/payables";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Purchase orders" };

const VIEWS: Record<string, { label: string; stages: PoStage[] }> = {
  open: { label: "Open", stages: ["draft", "sent", "received", "billed"] },
  drafts: { label: "Drafts", stages: ["draft"] },
  receive: { label: "To receive", stages: ["sent"] },
  bill: { label: "To bill", stages: ["received"] },
};

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const rows = await db
    .select({ po: purchaseOrders, supplierName: suppliers.name, orderNumber: salesOrders.number })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(salesOrders, eq(salesOrders.id, purchaseOrders.orderId))
    .where(and(q ? or(ilike(purchaseOrders.number, likeTerm(q)), ilike(suppliers.name, likeTerm(q)), ilike(salesOrders.number, likeTerm(q))) : undefined))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(300);
  const summary = await poSummaries(rows.map((r) => r.po.id));
  const withStage = rows.map((r) => ({ ...r, stage: summary.get(r.po.id)?.stage ?? "draft" }));
  const view = params.view && params.view in VIEWS ? params.view : params.view === "all" ? "all" : "open";
  const shown = view === "all" ? withStage : withStage.filter((r) => VIEWS[view].stages.includes(r.stage));
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Purchases"
        actions={
          <LinkButton href="/purchases/orders/new">
            <PlusIcon />
            New PO
          </LinkButton>
        }
      />
      <PurchasesTabs />
      {rows.length === 0 && !q ? (
        <EmptyState
          title="No purchase orders yet"
          sentence="Order fabric from a supplier here. Stitching POs for a unit appear by themselves when you give order lines to a stitching unit."
          action={<LinkButton href="/purchases/orders/new">Make your first PO</LinkButton>}
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by PO number, supplier or order number" />
            <FilterChips
              base="/purchases/orders"
              params={params}
              name="view"
              options={[
                ...Object.entries(VIEWS).map(([value, v]) => ({ value: value === "open" ? undefined : value, label: v.label, count: withStage.filter((r) => v.stages.includes(r.stage)).length })),
                { value: "all", label: "All" },
              ]}
            />
          </div>
          {shown.length ? (
            <ul className="flex flex-col gap-2">
              {shown.map(({ po, supplierName, orderNumber, stage }) => (
                <li key={po.id}>
                  <Link href={`/purchases/orders/${po.id}`} className="group flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3.5 hover:border-ink/20 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular text-[13px] font-semibold text-ink-muted">{po.number ?? "Draft"}</span>
                        <PoStageTag stage={stage} />
                        {po.kind === "outsourcing" ? <span className="text-[12px] font-semibold text-ink-muted">Stitching{orderNumber ? ` for ${orderNumber}` : ""}</span> : null}
                        {po.expectedDate && stage === "sent" ? (
                          <span className={po.expectedDate < today ? "text-[12px] font-semibold text-brand-deep" : "text-[12px] text-ink-muted"}>Expected {formatISODate(po.expectedDate)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-[16px] font-semibold">{supplierName}</p>
                    </div>
                    <p className="tabular text-[15px] font-semibold">{formatFils(po.totalFils)}</p>
                    <ChevronRightIcon className="size-5 text-ink-muted/60" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState sentence={q ? `No purchase order matches "${q}".` : "Nothing here."} action={<LinkButton href="/purchases/orders?view=all" variant="outline">Show all</LinkButton>} />
          )}
        </>
      )}
    </>
  );
}
