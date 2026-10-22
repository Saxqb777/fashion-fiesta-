import type { Metadata } from "next";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { db } from "@/db";
import { customers, salesOrders } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { SearchBox } from "@/components/data/search-box";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { OrderRow } from "@/components/orders/order-row";
import { PageHeader } from "@/components/page-header";
import { OrdersTabs } from "@/components/section-navs";
import { likeTerm } from "@/lib/archive";
import { todayISO } from "@/lib/dates";
import { orderListColumns } from "@/lib/order-queries";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Orders" };

const VIEWS = {
  open: ["confirmed", "stitching", "ready"],
  drafts: ["draft"],
  ready: ["ready"],
  delivered: ["delivered", "invoiced", "paid"],
} as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  await requireOwner();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const view = (params.view && params.view in VIEWS ? params.view : params.view === "all" ? "all" : "open") as keyof typeof VIEWS | "all";
  // "All" means every real order. Drafts only show under Drafts.
  const today = todayISO();
  const stages = view === "all" ? (["confirmed", "stitching", "ready", "delivered", "invoiced", "paid", "cancelled"] as const) : VIEWS[view];

  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select(orderListColumns)
      .from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(and(stages ? inArray(salesOrders.stage, [...stages]) : undefined, q ? or(ilike(salesOrders.number, likeTerm(q)), ilike(salesOrders.customerPoNumber, likeTerm(q)), ilike(customers.name, likeTerm(q))) : undefined))
      .orderBy(
        ...(view === "open"
          ? [
              sql`case when ${salesOrders.stage} <> 'ready' and ${salesOrders.dueDate} < ${today} then 0 else 1 end`,
              sql`${salesOrders.dueDate} asc nulls last`,
              desc(salesOrders.createdAt),
            ]
          : [desc(salesOrders.createdAt)]),
      )
      .limit(200),
    db.select({ total: count() }).from(salesOrders),
    db.select({ stage: salesOrders.stage, n: count() }).from(salesOrders).groupBy(salesOrders.stage),
  ]);
  const n = (list: readonly string[]) => counts.filter((c) => list.includes(c.stage)).reduce((s, c) => s + c.n, 0);

  return (
    <>
      <PageHeader
        title="Orders"
        actions={
          <LinkButton href="/orders/new">
            <PlusIcon />
            New order
          </LinkButton>
        }
      />
      <OrdersTabs />
      {total === 0 ? (
        <EmptyState
          title="No orders yet"
          sentence="Make an order for a walk in straight away, or start with a quote for a school and confirm it later."
          action={
            <LinkButton href="/orders/new">
              <PlusIcon />
              Make your first order
            </LinkButton>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <SearchBox placeholder="Search by order number, Customer PO or customer" />
            <FilterChips
              base="/orders"
              params={params}
              name="view"
              options={[
                { label: "Open", count: n(VIEWS.open) },
                { value: "ready", label: "Ready", count: n(VIEWS.ready) },
                { value: "delivered", label: "Delivered", count: n(VIEWS.delivered) },
                ...(n(VIEWS.drafts) ? [{ value: "drafts", label: "Drafts", count: n(VIEWS.drafts) }] : []),
                { value: "all", label: "All" },
              ]}
            />
          </div>
          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map((o) => (
                <OrderRow key={o.id} o={o} />
              ))}
            </ul>
          ) : (
            <EmptyState
              sentence={q ? `No order matches "${q}".` : view === "open" ? "Nothing open. Every order is delivered." : view === "drafts" ? "No drafts. Every order is confirmed." : "No orders here yet."}
              action={
                <LinkButton href="/orders/new">
                  <PlusIcon />
                  New order
                </LinkButton>
              }
            />
          )}
        </>
      )}
    </>
  );
}
