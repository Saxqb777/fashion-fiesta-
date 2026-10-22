import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { goodsReceiptLines, goodsReceipts, poLines, purchaseOrders, taskReviews, tasks } from "@/db/schema";
import { todayISO } from "./dates";
import { refreshOrderStage } from "./order-stage";

/**
 * A stitching unit's pieces can be recorded on the task or on its PO.
 * These keep the two in step: whichever is used, the other follows.
 */

/** The live (confirmed, not cancelled) PO line for a unit task, with pieces already back on it. */
export async function unitPoLineFor(taskId: string) {
  const [row] = await db
    .select({ line: poLines, po: purchaseOrders })
    .from(poLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, poLines.poId))
    .where(and(eq(poLines.taskId, taskId), eq(purchaseOrders.status, "sent")))
    .limit(1);
  if (!row) return null;
  const [{ n }] = await db.select({ n: sql<number>`coalesce(sum(${goodsReceiptLines.qtyCenti}),0)::int` }).from(goodsReceiptLines).where(eq(goodsReceiptLines.poLineId, row.line.id));
  return { ...row, backPieces: Math.floor(Number(n) / 100) };
}

/** Task said "N pieces back in total": add the difference to the PO as a goods receipt. */
export async function recordPiecesOnPo(taskId: string, totalBack: number, actorId: string) {
  const link = await unitPoLineFor(taskId);
  if (!link || totalBack <= link.backPieces) return;
  const receiptId = randomUUID();
  await db.batch([
    db.insert(goodsReceipts).values({ id: receiptId, poId: link.po.id, receivedDate: todayISO(), notes: "Recorded on the task", createdBy: actorId }),
    db.insert(goodsReceiptLines).values({ receiptId, poLineId: link.line.id, qtyCenti: (totalBack - link.backPieces) * 100, createdBy: actorId }),
  ]);
}

/** Pieces received on a PO: move each linked task's count to the total back, approving it when all are in. */
export async function applyPoPiecesToTasks(poLineIds: string[], actorId: string) {
  if (!poLineIds.length) return;
  const rows = await db
    .select({ taskId: poLines.taskId, back: sql<number>`coalesce((select sum(r.qty_centi) from goods_receipt_lines r where r.po_line_id = po_lines.id),0)::int` })
    .from(poLines)
    .where(and(inArray(poLines.id, poLineIds), sql`${poLines.taskId} is not null`));
  const orders = new Set<string>();
  for (const r of rows) {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, r.taskId!) });
    if (!task || task.assigneeType !== "unit" || task.status === "approved") continue;
    const back = Math.min(task.qty, Math.floor(Number(r.back) / 100));
    if (back <= task.qtyDone) continue;
    const done = back >= task.qty;
    await db
      .update(tasks)
      .set({ qtyDone: back, status: done ? "approved" : "in_progress", ...(done ? { approvedAt: new Date(), submittedAt: new Date() } : {}) })
      .where(eq(tasks.id, task.id));
    if (done) await db.insert(taskReviews).values({ taskId: task.id, decision: "approved", createdBy: actorId });
    orders.add(task.orderId);
  }
  for (const id of orders) await refreshOrderStage(id);
}
