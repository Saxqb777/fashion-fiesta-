import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveryNoteLines, invoiceLines, invoices, salesOrders, soLines, tasks, type OrderStage } from "@/db/schema";
import { invoiceFigures } from "./ledger";
import { computeStage } from "./stages";

const RANK: Record<OrderStage, number> = { draft: -1, confirmed: 0, stitching: 1, ready: 2, delivered: 3, invoiced: 4, paid: 5, cancelled: 9 };

/**
 * Moves an order forward from what has happened: work approved, pieces delivered,
 * everything invoiced, every invoice paid. Never moves it back.
 */
export async function refreshOrderStage(orderId: string) {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order || order.stage === "draft" || order.stage === "cancelled") return;
  const [lines, ts, delivered, invoiced, invs] = await Promise.all([
    db.select({ id: soLines.id, qty: soLines.qty }).from(soLines).where(eq(soLines.orderId, orderId)),
    db.select({ soLineId: tasks.soLineId, qty: tasks.qty, qtyDone: tasks.qtyDone, status: tasks.status }).from(tasks).where(eq(tasks.orderId, orderId)),
    db
      .select({ id: deliveryNoteLines.soLineId, n: sql<number>`sum(${deliveryNoteLines.qty})::int` })
      .from(deliveryNoteLines)
      .innerJoin(soLines, eq(soLines.id, deliveryNoteLines.soLineId))
      .where(eq(soLines.orderId, orderId))
      .groupBy(deliveryNoteLines.soLineId),
    db
      .select({ id: invoiceLines.soLineId, n: sql<number>`sum(${invoiceLines.qty})::int` })
      .from(invoiceLines)
      .innerJoin(soLines, eq(soLines.id, invoiceLines.soLineId))
      .where(eq(soLines.orderId, orderId))
      .groupBy(invoiceLines.soLineId),
    db.select({ id: invoices.id }).from(invoices).where(eq(invoices.orderId, orderId)),
  ]);
  const full = (rows: { id: string | null; n: number }[]) => lines.length > 0 && lines.every((l) => (rows.find((r) => r.id === l.id)?.n ?? 0) >= l.qty);
  const fullyDelivered = Boolean(order.deliveredAt) || full(delivered);
  const fullyInvoiced = full(invoiced);
  let fullyPaid = false;
  if (fullyInvoiced && invs.length) {
    const figures = await invoiceFigures(invs.map((i) => i.id));
    fullyPaid = [...figures.values()].every((f) => f.balanceFils <= 0);
  }
  let next: OrderStage = computeStage(RANK[order.stage] <= 2 ? order.stage : "ready", lines, ts);
  if (fullyDelivered) next = "delivered";
  if (fullyInvoiced) next = "invoiced";
  if (fullyPaid) next = "paid";
  if (RANK[next] > RANK[order.stage]) {
    await db
      .update(salesOrders)
      .set({
        stage: next,
        ...(next === "ready" && !order.readyAt ? { readyAt: new Date() } : {}),
        ...(RANK[next] >= RANK.delivered && !order.deliveredAt ? { deliveredAt: new Date() } : {}),
      })
      .where(eq(salesOrders.id, orderId));
  }
}

/** Orders touched by these invoices, refreshed after a payment or credit note. */
export async function refreshOrdersForInvoices(invoiceIds: string[]) {
  if (!invoiceIds.length) return;
  const rows = await db.selectDistinct({ orderId: invoices.orderId }).from(invoices).where(inArray(invoices.id, invoiceIds));
  for (const r of rows) if (r.orderId) await refreshOrderStage(r.orderId);
}
