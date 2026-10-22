import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { poLines, purchaseOrders, salesOrders, soLines, suppliers, tasks } from "@/db/schema";
import { logActivity } from "./activity";
import { todayISO } from "./dates";
import { lineAmountsCenti } from "./qty";
import { getSettings } from "./settings";

type Actor = { id: string; name?: string | null };

async function recomputeTotals(poId: string) {
  const lines = await db.select().from(poLines).where(eq(poLines.poId, poId));
  const subtotalFils = lines.reduce((s, l) => s + l.netFils, 0);
  const vatFils = lines.reduce((s, l) => s + l.vatFils, 0);
  await db.update(purchaseOrders).set({ subtotalFils, vatFils, totalFils: subtotalFils + vatFils }).where(eq(purchaseOrders.id, poId));
}

/**
 * Lines given to a stitching unit get a draft outsourcing PO, one per unit per order.
 * Draft POs follow the order; a PO already sent to the unit is left as it is.
 */
export async function syncOutsourcingPOs(orderId: string, actor: Actor) {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order || order.stage === "draft" || order.stage === "cancelled") return;
  const settings = await getSettings();
  const unitTasks = await db
    .select({ task: tasks, line: soLines })
    .from(tasks)
    .innerJoin(soLines, eq(soLines.id, tasks.soLineId))
    .where(and(eq(tasks.orderId, orderId), eq(tasks.assigneeType, "unit")));
  const existing = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.orderId, orderId), eq(purchaseOrders.kind, "outsourcing"), ne(purchaseOrders.status, "cancelled")));
  const unitIds = [...new Set(unitTasks.map((t) => t.task.supplierId!).filter(Boolean))];

  for (const unitId of unitIds) {
    const po = existing.find((p) => p.supplierId === unitId);
    if (po && po.status !== "draft") continue;
    const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, unitId) });
    const vatRateBp = supplier?.trn ? settings.vatRateBp : 0;
    const mine = unitTasks.filter((t) => t.task.supplierId === unitId);
    const poId = po?.id ?? randomUUID();
    if (!po) {
      await db.insert(purchaseOrders).values({
        id: poId,
        kind: "outsourcing",
        status: "draft",
        supplierId: unitId,
        orderId,
        poDate: todayISO(),
        expectedDate: mine.map((t) => t.task.dueDate).filter(Boolean).sort()[0] ?? order.dueDate,
        notes: order.number ? `Stitching for order ${order.number}` : null,
        createdBy: actor.id,
      });
      await logActivity({ actor, entityType: "purchase_order", entityId: poId, action: "created", summary: `Draft outsourcing PO made for ${supplier?.name ?? "a stitching unit"} from order ${order.number}` });
    }
    const current = po ? await db.select().from(poLines).where(eq(poLines.poId, poId)) : [];
    const keep = new Set(mine.map((t) => t.task.id));
    const stale = current.filter((l) => !l.taskId || !keep.has(l.taskId)).map((l) => l.id);
    if (stale.length) await db.delete(poLines).where(inArray(poLines.id, stale));
    for (const [i, { task, line }] of mine.entries()) {
      const qtyCenti = task.qty * 100;
      const have = current.find((l) => l.taskId === task.id);
      if (have) {
        const { netFils, vatFils } = lineAmountsCenti(qtyCenti, have.unitPriceFils, have.vatRateBp);
        await db.update(poLines).set({ sort: i, description: line.description, qtyCenti, netFils, vatFils }).where(eq(poLines.id, have.id));
        continue;
      }
      // Their last charge for the same garment.
      const last = line.productId
        ? await db
            .select({ price: poLines.unitPriceFils })
            .from(poLines)
            .innerJoin(purchaseOrders, eq(purchaseOrders.id, poLines.poId))
            .where(and(eq(purchaseOrders.supplierId, unitId), eq(poLines.productId, line.productId)))
            .orderBy(desc(poLines.createdAt))
            .limit(1)
        : [];
      const price = last[0]?.price ?? 0;
      const { netFils, vatFils } = lineAmountsCenti(qtyCenti, price, vatRateBp);
      await db.insert(poLines).values({
        poId,
        sort: i,
        productId: line.productId,
        soLineId: line.id,
        taskId: task.id,
        description: line.description,
        unit: "pcs",
        qtyCenti,
        unitPriceFils: price,
        vatRateBp,
        netFils,
        vatFils,
        createdBy: actor.id,
      });
    }
    await recomputeTotals(poId);
  }

  // A unit no longer on the order: its untouched draft goes.
  for (const po of existing) {
    if (po.status === "draft" && !unitIds.includes(po.supplierId)) {
      await db.delete(poLines).where(eq(poLines.poId, po.id));
      await db.delete(purchaseOrders).where(eq(purchaseOrders.id, po.id));
    }
  }
}
