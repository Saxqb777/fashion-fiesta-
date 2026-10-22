import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { goodsReceiptLines, poLines, stockMovements, supplierBillLines, supplierBills, supplierPaymentAllocations, suppliers, type SupplierType } from "@/db/schema";
import { addDaysISO, todayISO } from "./dates";

export type BillFigures = { totalFils: number; paidFils: number; balanceFils: number };

/** Total, paid and balance for each supplier bill. */
export async function billFigures(ids: string[]): Promise<Map<string, BillFigures>> {
  const out = new Map<string, BillFigures>();
  if (!ids.length) return out;
  const [bills, paid] = await Promise.all([
    db.select({ id: supplierBills.id, total: supplierBills.totalFils }).from(supplierBills).where(inArray(supplierBills.id, ids)),
    db
      .select({ id: supplierPaymentAllocations.billId, n: sql<number>`coalesce(sum(${supplierPaymentAllocations.amountFils}),0)::int` })
      .from(supplierPaymentAllocations)
      .where(inArray(supplierPaymentAllocations.billId, ids))
      .groupBy(supplierPaymentAllocations.billId),
  ]);
  for (const b of bills) {
    const p = paid.find((x) => x.id === b.id)?.n ?? 0;
    out.set(b.id, { totalFils: b.total, paidFils: p, balanceFils: b.total - p });
  }
  return out;
}

export type BillStatus = "paid" | "part_paid" | "overdue" | "unpaid";
export function billStatus(f: BillFigures, dueDate: string, today = todayISO()): BillStatus {
  if (f.balanceFils <= 0) return "paid";
  if (dueDate < today) return "overdue";
  if (f.paidFils > 0) return "part_paid";
  return "unpaid";
}
export const BILL_STATUS_LABEL: Record<BillStatus, string> = { paid: "Paid", part_paid: "Part paid", overdue: "Overdue", unpaid: "Unpaid" };

export type SupplierAgingRow = {
  supplierId: string;
  name: string;
  type: SupplierType;
  notDue: number;
  d1_30: number;
  d31_60: number;
  d61: number;
  owed: number;
  advance: number;
  oldestDue: string | null;
};

/** Who you owe, aged by how late each open bill is. */
export async function agingBySupplier(supplierId?: string): Promise<SupplierAgingRow[]> {
  const today = todayISO();
  const result = await db.execute<{
    supplier_id: string;
    name: string;
    type: SupplierType;
    not_due: number;
    d1_30: number;
    d31_60: number;
    d61: number;
    owed: number;
    advance: number;
    oldest_due: string | null;
  }>(sql`
    with bal as (
      select b.supplier_id, b.due_date,
        b.total_fils - coalesce((select sum(a.amount_fils) from supplier_payment_allocations a where a.bill_id = b.id), 0) as balance
      from supplier_bills b
      ${supplierId ? sql`where b.supplier_id = ${supplierId}` : sql``}
    ),
    open as (select * from bal where balance > 0),
    adv as (
      select p.supplier_id, sum(p.amount_fils - coalesce((select sum(a.amount_fils) from supplier_payment_allocations a where a.payment_id = p.id), 0)) as advance
      from supplier_payments p group by p.supplier_id
    )
    select s.id as supplier_id, s.name, s.type,
      coalesce(sum(case when o.due_date >= ${today} then o.balance end), 0)::int as not_due,
      coalesce(sum(case when o.due_date < ${today} and o.due_date >= (${today}::date - 30) then o.balance end), 0)::int as d1_30,
      coalesce(sum(case when o.due_date < (${today}::date - 30) and o.due_date >= (${today}::date - 60) then o.balance end), 0)::int as d31_60,
      coalesce(sum(case when o.due_date < (${today}::date - 60) then o.balance end), 0)::int as d61,
      coalesce(sum(o.balance), 0)::int as owed,
      coalesce(max(ad.advance), 0)::int as advance,
      min(o.due_date)::text as oldest_due
    from suppliers s
    left join open o on o.supplier_id = s.id
    left join adv ad on ad.supplier_id = s.id
    where (o.supplier_id is not null or ad.advance > 0) ${supplierId ? sql`and s.id = ${supplierId}` : sql``}
    group by s.id
    order by owed desc
  `);
  return result.rows.map((r) => ({
    supplierId: r.supplier_id,
    name: r.name,
    type: r.type,
    notDue: Number(r.not_due),
    d1_30: Number(r.d1_30),
    d31_60: Number(r.d31_60),
    d61: Number(r.d61),
    owed: Number(r.owed),
    advance: Number(r.advance),
    oldestDue: r.oldest_due,
  }));
}

export async function openBillsFor(supplierId: string) {
  const rows = await db
    .select({ id: supplierBills.id, kind: supplierBills.kind, billNumber: supplierBills.billNumber, billDate: supplierBills.billDate, dueDate: supplierBills.dueDate })
    .from(supplierBills)
    .where(eq(supplierBills.supplierId, supplierId))
    .orderBy(supplierBills.dueDate, supplierBills.createdAt);
  const figures = await billFigures(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...figures.get(r.id)! })).filter((r) => r.balanceFils > 0);
}

export async function supplierDueDate(supplierId: string, billDate: string) {
  const s = await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId), columns: { paymentDays: true } });
  return addDaysISO(billDate, s?.paymentDays ?? 0);
}

export const billLabel = (b: { kind: "bill" | "opening_balance"; billNumber: string | null }) =>
  b.kind === "opening_balance" ? "Opening balance" : b.billNumber ? `Bill ${b.billNumber}` : "Bill";

/** Received and billed quantities for each line of a PO. */
export async function poLineProgress(poId: string) {
  const [lines, received, billed] = await Promise.all([
    db.select().from(poLines).where(eq(poLines.poId, poId)).orderBy(poLines.sort),
    db
      .select({ id: goodsReceiptLines.poLineId, n: sql<number>`sum(${goodsReceiptLines.qtyCenti})::int` })
      .from(goodsReceiptLines)
      .innerJoin(poLines, eq(poLines.id, goodsReceiptLines.poLineId))
      .where(eq(poLines.poId, poId))
      .groupBy(goodsReceiptLines.poLineId),
    db
      .select({ id: supplierBillLines.poLineId, n: sql<number>`sum(${supplierBillLines.qtyCenti})::int` })
      .from(supplierBillLines)
      .innerJoin(poLines, eq(poLines.id, supplierBillLines.poLineId))
      .where(eq(poLines.poId, poId))
      .groupBy(supplierBillLines.poLineId),
  ]);
  return lines.map((l) => ({
    ...l,
    receivedCenti: received.find((r) => r.id === l.id)?.n ?? 0,
    billedCenti: billed.find((r) => r.id === l.id)?.n ?? 0,
  }));
}

/** Stock on hand per fabric, in hundredths of a metre. */
export async function stockFor(fabricIds?: string[]) {
  const rows = await db
    .select({ id: stockMovements.fabricId, n: sql<number>`coalesce(sum(${stockMovements.qtyCenti}),0)::int` })
    .from(stockMovements)
    .where(fabricIds ? (fabricIds.length ? inArray(stockMovements.fabricId, fabricIds) : sql`false`) : undefined)
    .groupBy(stockMovements.fabricId);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

/** Fabric already taken for each task, in hundredths of a metre. */
export async function takenForTasks(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, number>();
  const rows = await db
    .select({ id: stockMovements.taskId, n: sql<number>`coalesce(sum(-${stockMovements.qtyCenti}),0)::int` })
    .from(stockMovements)
    .where(and(inArray(stockMovements.taskId, taskIds), eq(stockMovements.kind, "taken")))
    .groupBy(stockMovements.taskId);
  return new Map(rows.map((r) => [r.id!, Number(r.n)]));
}

export const PO_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "received", label: "Received" },
  { key: "billed", label: "Billed" },
  { key: "paid", label: "Paid" },
];
export type PoStage = "draft" | "sent" | "received" | "billed" | "paid" | "cancelled";

/** Where each PO stands: received in full, billed in full, bills paid. */
export async function poSummaries(ids: string[]) {
  const out = new Map<string, { stage: PoStage; received: boolean; billedFils: number; paidFils: number }>();
  if (!ids.length) return out;
  const result = await db.execute<{ id: string; status: "draft" | "sent" | "cancelled"; total: number; received: boolean; billed: number; paid: number }>(sql`
    select po.id, po.status, po.total_fils as total,
      coalesce((select bool_and(coalesce((select sum(r.qty_centi) from goods_receipt_lines r where r.po_line_id = l.id), 0) >= l.qty_centi) from po_lines l where l.po_id = po.id), false) as received,
      coalesce((select sum(b.total_fils) from supplier_bills b where b.po_id = po.id), 0)::int as billed,
      coalesce((select sum(a.amount_fils) from supplier_payment_allocations a join supplier_bills b on b.id = a.bill_id where b.po_id = po.id), 0)::int as paid
    from purchase_orders po where po.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `);
  for (const r of result.rows) {
    const billed = Number(r.billed);
    const paid = Number(r.paid);
    const fullyBilled = billed > 0 && billed >= Number(r.total);
    const stage: PoStage =
      r.status === "cancelled" ? "cancelled" : r.status === "draft" ? "draft" : fullyBilled && paid >= billed ? "paid" : fullyBilled ? "billed" : r.received ? "received" : "sent";
    out.set(r.id, { stage, received: Boolean(r.received), billedFils: billed, paidFils: paid });
  }
  return out;
}

/** For Today: supplier bills past their pay by date, and due in the next 7 days. */
export async function payablesDue() {
  const today = todayISO();
  const week = addDaysISO(today, 7);
  const result = await db.execute<{ overdue_n: number; overdue: number; week_n: number; week: number }>(sql`
    with bal as (
      select b.due_date, b.total_fils - coalesce((select sum(a.amount_fils) from supplier_payment_allocations a where a.bill_id = b.id), 0) as balance
      from supplier_bills b
    )
    select
      count(*) filter (where balance > 0 and due_date < ${today})::int as overdue_n,
      coalesce(sum(balance) filter (where balance > 0 and due_date < ${today}), 0)::int as overdue,
      count(*) filter (where balance > 0 and due_date >= ${today} and due_date <= ${week})::int as week_n,
      coalesce(sum(balance) filter (where balance > 0 and due_date >= ${today} and due_date <= ${week}), 0)::int as week
    from bal
  `);
  const r = result.rows[0];
  return { overdueCount: Number(r?.overdue_n ?? 0), overdueFils: Number(r?.overdue ?? 0), weekCount: Number(r?.week_n ?? 0), weekFils: Number(r?.week ?? 0) };
}

/** Fabrics at or below their low stock level. */
export async function lowStockFabrics() {
  const result = await db.execute<{ id: string; name: string; colour: string | null; stock: number; low: number }>(sql`
    select f.id, f.name, f.colour, coalesce((select sum(m.qty_centi) from stock_movements m where m.fabric_id = f.id), 0)::int as stock, f.low_stock_centi as low
    from fabrics f
    where f.deleted_at is null and f.low_stock_centi is not null
      and coalesce((select sum(m.qty_centi) from stock_movements m where m.fabric_id = f.id), 0) <= f.low_stock_centi
    order by f.name
  `);
  return result.rows.map((r) => ({ id: r.id, name: [r.name, r.colour].filter(Boolean).join(", "), stockCenti: Number(r.stock) }));
}
