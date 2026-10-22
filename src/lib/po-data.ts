import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { fabrics, poLines, purchaseOrders, salesOrders, suppliers } from "@/db/schema";
import type { PoFabric, PoInitial, PoSupplier } from "@/components/purchases/po-editor";
import { todayISO } from "./dates";
import { centiInput } from "./qty";

export async function poEditorData(): Promise<{ suppliers: PoSupplier[]; fabrics: PoFabric[] }> {
  const [s, f] = await Promise.all([
    db.select({ id: suppliers.id, name: suppliers.name, type: suppliers.type, trn: suppliers.trn }).from(suppliers)
      .where(and(isNull(suppliers.deletedAt), ne(suppliers.type, "delivery")))
      .orderBy(asc(suppliers.name)),
    db.select({ id: fabrics.id, name: fabrics.name, colour: fabrics.colour, costFils: fabrics.costFils }).from(fabrics).where(isNull(fabrics.deletedAt)).orderBy(asc(fabrics.name)),
  ]);
  return { suppliers: s, fabrics: f };
}

let n = 0;
const k = () => `l${n++}`;

export async function initialForNewPO(supplierId?: string): Promise<PoInitial> {
  const supplier = supplierId && /^[0-9a-f-]{36}$/.test(supplierId) ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) }) : undefined;
  return { isDraft: true, supplierId: supplier?.id ?? "", poDate: todayISO(), expectedDate: "", notes: "", vat: Boolean(supplier?.trn), lines: [] };
}

export async function initialForPO(id: string): Promise<PoInitial | null> {
  const po = /^[0-9a-f-]{36}$/.test(id) ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }) : undefined;
  if (!po) return null;
  const [lines, order] = await Promise.all([
    db.select().from(poLines).where(eq(poLines.poId, id)).orderBy(asc(poLines.sort)),
    po.orderId ? db.query.salesOrders.findFirst({ where: eq(salesOrders.id, po.orderId), columns: { number: true } }) : undefined,
  ]);
  return {
    id: po.id,
    isDraft: po.status === "draft",
    supplierId: po.supplierId,
    poDate: po.poDate,
    expectedDate: po.expectedDate ?? "",
    notes: po.notes ?? "",
    vat: po.subtotalFils ? po.vatFils > 0 : lines.some((l) => l.vatRateBp > 0),
    lines: lines.map((l) => ({
      key: k(),
      fabricId: l.fabricId,
      soLineId: l.soLineId,
      taskId: l.taskId,
      hint: l.taskId && order?.number ? `For order ${order.number}` : null,
      description: l.description,
      unit: l.unit,
      qty: l.unit === "pcs" ? String(l.qtyCenti / 100) : centiInput(l.qtyCenti),
      unitPrice: l.unitPriceFils ? (l.unitPriceFils / 100).toFixed(2) : "",
    })),
  };
}
