import Link from "next/link";
import { and, desc, eq, exists, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customerBranches, deliveryNoteLines, deliveryNotes, invoices, salesOrders, soLineAllocations, soLines } from "@/db/schema";
import { FilterChips } from "@/components/data/filter-chips";
import { StageTag } from "@/components/orders/bits";
import { formatISODate } from "@/lib/dates";
import { agingByCustomer, invoiceFigures } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { orderNo } from "@/lib/stages";
import { BranchFilter } from "./branch-filter";

type Params = Record<string, string | undefined>;

/** Their orders, filtered by season and by branch. A split order shows under every branch it serves. */
export async function AccountOrders({ customerId, params, seasons, branches }: { customerId: string; params: Params; seasons: string[]; branches: { id: string; name: string }[] }) {
  const season = params.season && seasons.includes(params.season) ? params.season : undefined;
  const branchId = branches.some((b) => b.id === params.branch) ? params.branch : undefined;
  const rows = await db
    .select({
      o: salesOrders,
      pieces: sql<number>`(select coalesce(sum(l.qty), 0)::int from so_lines l where l.order_id = sales_orders.id)`,
    })
    .from(salesOrders)
    .where(
      and(
        eq(salesOrders.customerId, customerId),
        ne(salesOrders.stage, "cancelled"),
        season ? eq(salesOrders.season, season) : undefined,
        branchId
          ? or(
              eq(salesOrders.branchId, branchId),
              exists(
                db
                  .select({ x: sql`1` })
                  .from(soLineAllocations)
                  .innerJoin(soLines, eq(soLines.id, soLineAllocations.soLineId))
                  .where(and(eq(soLines.orderId, salesOrders.id), eq(soLineAllocations.branchId, branchId))),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(salesOrders.orderDate), desc(salesOrders.createdAt))
    .limit(200);
  const base = `/customers/${customerId}`;
  const keep = { tab: "orders", season, branch: branchId };
  const total = rows.reduce((s, r) => s + r.o.totalFils, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {seasons.length ? <FilterChips base={base} params={keep} name="season" options={[{ label: "All seasons" }, ...seasons.map((s) => ({ value: s, label: s }))]} /> : null}
        {branches.length ? <BranchFilter base={base} params={keep} branches={branches} value={branchId ?? ""} /> : null}
        <Link href={`/orders/new?customer=${customerId}`} className="ml-auto text-[14px] font-semibold text-brand hover:underline">
          New order
        </Link>
      </div>
      {rows.length ? (
        <>
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {rows.map(({ o, pieces }) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link href={`/orders/${o.id}`} className="tabular min-w-0 flex-1 text-[15px] font-semibold hover:underline">
                  {orderNo(o.number)}
                  <span className="ml-2 text-[12px] font-medium text-ink-muted">
                    {formatISODate(o.orderDate, true)}
                    {o.season ? `, ${o.season}` : ""}
                    {o.customerPoNumber ? `, their PO ${o.customerPoNumber}` : ""}
                  </span>
                </Link>
                <span className="tabular text-[13px] text-ink-muted">{pieces} pieces</span>
                <StageTag stage={o.stage} />
                <span className="tabular w-28 text-right text-sm">{formatFils(o.totalFils, { currency: false })}</span>
              </li>
            ))}
          </ul>
          <p className="tabular text-right text-[13px] text-ink-muted">
            {rows.length} {rows.length === 1 ? "order" : "orders"}, {formatFils(total)}
          </p>
        </>
      ) : (
        <p className="text-[15px] text-ink-muted">{season || branchId ? "No orders match. Clear a filter to see more." : "No orders yet. Their first order starts from New order, with their agreed prices filled in."}</p>
      )}
    </div>
  );
}

/** The account in numbers: seasons, branches, what is still to deliver, and how they pay. */
export async function AccountReport({ customerId }: { customerId: string }) {
  const live = and(eq(salesOrders.customerId, customerId), ne(salesOrders.stage, "draft"), ne(salesOrders.stage, "cancelled"));
  const [bySeason, branches, ordered, splitOrdered, delivered, [money], invs] = await Promise.all([
    db
      .select({
        season: salesOrders.season,
        orders: sql<number>`count(*)::int`,
        value: sql<number>`coalesce(sum(${salesOrders.totalFils}), 0)::int`,
        pieces: sql<number>`coalesce(sum((select coalesce(sum(l.qty), 0) from so_lines l where l.order_id = sales_orders.id)), 0)::int`,
      })
      .from(salesOrders)
      .where(live)
      .groupBy(salesOrders.season)
      .orderBy(sql`max(${salesOrders.orderDate}) desc`),
    db.select({ id: customerBranches.id, name: customerBranches.name, emirate: customerBranches.emirate }).from(customerBranches).where(eq(customerBranches.customerId, customerId)),
    // Lines that are not split count for the order's own branch.
    db
      .select({ branchId: salesOrders.branchId, n: sql<number>`coalesce(sum(${soLines.qty}), 0)::int` })
      .from(soLines)
      .innerJoin(salesOrders, eq(salesOrders.id, soLines.orderId))
      .where(and(live, sql`not exists (select 1 from so_line_allocations a where a.so_line_id = so_lines.id)`))
      .groupBy(salesOrders.branchId),
    db
      .select({ branchId: soLineAllocations.branchId, n: sql<number>`coalesce(sum(${soLineAllocations.qty}), 0)::int` })
      .from(soLineAllocations)
      .innerJoin(soLines, eq(soLines.id, soLineAllocations.soLineId))
      .innerJoin(salesOrders, eq(salesOrders.id, soLines.orderId))
      .where(live)
      .groupBy(soLineAllocations.branchId),
    db
      .select({ branchId: deliveryNotes.branchId, n: sql<number>`coalesce(sum(${deliveryNoteLines.qty}), 0)::int` })
      .from(deliveryNoteLines)
      .innerJoin(deliveryNotes, eq(deliveryNotes.id, deliveryNoteLines.deliveryNoteId))
      .where(and(eq(deliveryNotes.customerId, customerId), eq(deliveryNotes.status, "delivered")))
      .groupBy(deliveryNotes.branchId),
    agingByCustomer(customerId),
    db.select({ id: invoices.id, date: invoices.invoiceDate }).from(invoices).where(and(eq(invoices.customerId, customerId), eq(invoices.kind, "tax_invoice"))),
  ]);

  // Days to pay: invoice date to the payment that cleared it, for invoices paid in full.
  const figures = await invoiceFigures(invs.map((i) => i.id));
  const paidIds = invs.filter((i) => (figures.get(i.id)?.balanceFils ?? 1) <= 0).map((i) => i.id);
  const cleared = paidIds.length
    ? await db.execute<{ invoice_id: string; paid_on: string }>(sql`
        select a.invoice_id, max(p.payment_date)::text as paid_on from payment_allocations a join payments p on p.id = a.payment_id
        where a.invoice_id in (${sql.join(paidIds.map((id) => sql`${id}::uuid`), sql`, `)}) group by a.invoice_id`)
    : { rows: [] };
  const days = cleared.rows.map((r) => {
    const inv = invs.find((i) => i.id === r.invoice_id)!;
    return Math.max(0, Math.round((Date.parse(r.paid_on) - Date.parse(inv.date)) / 86_400_000));
  });
  const avgDays = days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null;

  const branchRows = [...branches, { id: null as string | null, name: "No branch", emirate: null }]
    .map((b) => {
      const o = (ordered.find((r) => r.branchId === b.id)?.n ?? 0) + (splitOrdered.find((r) => r.branchId === b.id)?.n ?? 0);
      const d = delivered.find((r) => r.branchId === b.id)?.n ?? 0;
      return { ...b, ordered: o, delivered: Math.min(d, o), pending: Math.max(0, o - d) };
    })
    .filter((b) => b.ordered)
    .sort((a, b) => b.ordered - a.ordered);
  const totalOrdered = branchRows.reduce((s, b) => s + b.ordered, 0);
  const totalDelivered = branchRows.reduce((s, b) => s + b.delivered, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-4">
        <section className="rounded-[14px] border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-xl font-medium">Per branch</h2>
          <p className="text-[14px] text-ink-muted">Pieces ordered and delivered. Pending notes on a run count as still to deliver.</p>
          {branchRows.length ? (
            <>
              <p className="tabular mt-4 font-display text-[2rem] leading-none">
                {totalDelivered}
                <span className="font-sans text-[15px] text-ink-muted"> of {totalOrdered} pieces delivered</span>
              </p>
              <table className="tabular mt-4 w-full text-left text-[14px]">
                <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                  <tr>
                    <th className="py-2">Branch</th>
                    <th className="py-2 text-right">Ordered</th>
                    <th className="py-2 text-right">Delivered</th>
                    <th className="py-2 text-right">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRows.map((b) => (
                    <tr key={b.id ?? "none"} className="border-t border-line">
                      <td className="py-2 pr-2">
                        <span className="font-semibold">{b.name}</span>
                        {b.emirate ? <span className="ml-2 text-[12px] text-ink-muted">{b.emirate}</span> : null}
                      </td>
                      <td className="py-2 text-right">{b.ordered}</td>
                      <td className="py-2 text-right">{b.delivered}</td>
                      <td className={b.pending ? "py-2 text-right font-semibold text-brand" : "py-2 text-right text-ink-muted"}>{b.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="mt-3 text-[15px] text-ink-muted">Fills in from their first confirmed order.</p>
          )}
        </section>
        <section className="rounded-[14px] border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-xl font-medium">By season</h2>
          {bySeason.length ? (
            <table className="tabular mt-3 w-full text-left text-[14px]">
              <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="py-2">Season</th>
                  <th className="py-2 text-right">Orders</th>
                  <th className="py-2 text-right">Pieces</th>
                  <th className="py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {bySeason.map((s) => (
                  <tr key={s.season ?? "none"} className="border-t border-line">
                    <td className="py-2 font-semibold">{s.season ?? "No season"}</td>
                    <td className="py-2 text-right">{s.orders}</td>
                    <td className="py-2 text-right">{s.pieces}</td>
                    <td className="py-2 text-right">{formatFils(s.value, { currency: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-[15px] text-ink-muted">Give an order a season, such as Winter 2026, and it is counted here.</p>
          )}
        </section>
      </div>
      <section className="h-fit rounded-[14px] border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-xl font-medium">Money</h2>
        <p className="mt-3 text-[13px] font-semibold text-ink-muted">They owe you</p>
        <p className="tabular font-display text-[2rem] leading-tight">{formatFils(money?.owed ?? 0)}</p>
        {money && money.d1_30 + money.d31_60 + money.d61 > 0 ? <p className="text-[14px] font-semibold text-brand">{formatFils(money.d1_30 + money.d31_60 + money.d61)} overdue</p> : null}
        <p className="mt-4 text-[13px] font-semibold text-ink-muted">Days to pay, on average</p>
        <p className="tabular font-display text-[2rem] leading-tight">{avgDays ?? "Not yet"}</p>
        <p className="text-[13px] text-ink-muted">{days.length ? `From ${days.length} invoices paid in full.` : "Shows once an invoice is paid in full."}</p>
      </section>
    </div>
  );
}
