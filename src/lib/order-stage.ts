import { eq } from "drizzle-orm";
import { db } from "@/db";
import { salesOrders, soLines, tasks } from "@/db/schema";
import { computeStage } from "./stages";

export async function refreshOrderStage(orderId: string) {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order) return;
  const [lines, ts] = await Promise.all([
    db.select({ id: soLines.id, qty: soLines.qty }).from(soLines).where(eq(soLines.orderId, orderId)),
    db.select({ soLineId: tasks.soLineId, qty: tasks.qty, qtyDone: tasks.qtyDone, status: tasks.status }).from(tasks).where(eq(tasks.orderId, orderId)),
  ]);
  const next = computeStage(order.stage, lines, ts);
  if (next !== order.stage) {
    await db
      .update(salesOrders)
      .set({ stage: next, ...(next === "ready" ? { readyAt: new Date() } : {}) })
      .where(eq(salesOrders.id, orderId));
  }
}
