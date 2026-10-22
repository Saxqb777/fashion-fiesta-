"use server";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { fabrics, goodsReceiptLines, goodsReceipts, poLines, purchaseOrders, stockMovements, supplierBills, suppliers, tasks } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/dates";
import { resolveFabric } from "@/lib/fabrics-auto";
import { flashDone } from "@/lib/flash";
import { moneySchema, text, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/numbering";
import { isoDate, issuesToErrors, uuidOrNull } from "@/lib/payload";
import { poLineProgress, stockFor } from "@/lib/payables";
import { formatQty, lineAmountsCenti, parseCenti } from "@/lib/qty";
import { requireOwner, requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];
const uuid = z.string().regex(/^[0-9a-f-]{36}$/, "Invalid reference.");
const qtySchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const c = parseCenti(v);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: "Enter a quantity like 12 or 12.50." });
      return z.NEVER;
    }
    return c;
  });

function readJson(fd: FormData) {
  try {
    return JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return {};
  }
}

function refresh(poId?: string, supplierId?: string) {
  revalidatePath("/purchases", "layout");
  revalidatePath("/today");
  if (poId) revalidatePath(`/purchases/orders/${poId}`);
  if (supplierId) revalidatePath(`/purchases/suppliers/${supplierId}`);
}

/** A PO can be changed until goods arrive or a bill is made against it. */
async function poLocked(poId: string) {
  const [[r], [b]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(goodsReceipts).where(eq(goodsReceipts.poId, poId)),
    db.select({ n: sql<number>`count(*)::int` }).from(supplierBills).where(eq(supplierBills.poId, poId)),
  ]);
  return r.n > 0 || b.n > 0;
}

/* ---------- Purchase orders ---------- */

const poSchema = z.object({
  id: uuidOrNull,
  supplierId: uuid,
  poDate: isoDate,
  expectedDate: isoDate.optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  vat: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        fabricId: uuidOrNull,
        soLineId: uuidOrNull,
        taskId: uuidOrNull,
        description: z.string().trim().min(1, "Type what this line is."),
        unit: z.enum(["m", "pcs"]),
        qty: qtySchema.refine((v) => v > 0, "More than 0."),
        unitPrice: moneySchema,
      }),
    )
    .min(1, "Add at least one line."),
});

export async function savePurchaseOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const intent = fd.get("intent") === "draft" ? "draft" : "confirm";
  const parsed = poSchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the highlighted lines.", errors: issuesToErrors(parsed.error) };
  const doc = parsed.data;
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, doc.supplierId) });
  if (!supplier || supplier.deletedAt) return { errors: { supplierId: ["Pick a supplier."] } };
  const existing = doc.id ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, doc.id) }) : undefined;
  if (doc.id && !existing) return { message: "That purchase order no longer exists." };
  if (existing?.status === "cancelled") return { message: "This purchase order is cancelled." };
  if (existing && existing.status !== "draft" && (await poLocked(existing.id))) return { message: "Goods or a bill are already recorded against it, so it cannot be changed." };
  if (existing && existing.status !== "draft" && intent === "draft") return { message: "A confirmed purchase order cannot go back to draft." };

  const settings = await getSettings();
  const vatRateBp = doc.vat ? settings.vatRateBp : 0;
  const kind = existing?.kind ?? (supplier.type === "outsourcing" ? "outsourcing" : "fabric");
  const cache = new Map<string, string>();
  const rows = [];
  for (const [i, l] of doc.lines.entries()) {
    const fabricId = l.unit === "m" && kind === "fabric" ? await resolveFabric({ fabricId: l.fabricId, description: l.description, unitPriceFils: l.unitPrice, supplierId: supplier.id }, me.id, cache) : null;
    const { netFils, vatFils } = lineAmountsCenti(l.qty, l.unitPrice, vatRateBp);
    rows.push({ sort: i, fabricId, soLineId: l.soLineId, taskId: l.taskId, description: l.description, unit: l.unit, qtyCenti: l.qty, unitPriceFils: l.unitPrice, vatRateBp, netFils, vatFils });
  }
  const subtotalFils = rows.reduce((s, r) => s + r.netFils, 0);
  const vatFils = rows.reduce((s, r) => s + r.vatFils, 0);
  const id = existing?.id ?? randomUUID();
  const confirming = intent === "confirm" && (!existing || existing.status === "draft");
  const number = existing?.number ?? (confirming ? await nextDocumentNumber("purchase_order") : null);
  const header = {
    supplierId: supplier.id,
    kind,
    poDate: doc.poDate ?? todayISO(),
    expectedDate: doc.expectedDate,
    notes: doc.notes || null,
    subtotalFils,
    vatFils,
    totalFils: subtotalFils + vatFils,
    ...(confirming ? { number, status: "sent" as const, sentAt: new Date() } : {}),
  };
  const batch: BatchItem<"pg">[] = existing
    ? [db.update(purchaseOrders).set(header).where(eq(purchaseOrders.id, id)), db.delete(poLines).where(eq(poLines.poId, id))]
    : [db.insert(purchaseOrders).values({ id, ...header, status: confirming ? "sent" : "draft", createdBy: me.id })];
  batch.push(db.insert(poLines).values(rows.map((r) => ({ poId: id, ...r, createdBy: me.id }))));
  await db.batch(batch as Batch);
  await logActivity({
    actor: me,
    entityType: "purchase_order",
    entityId: id,
    action: confirming ? "status_changed" : existing ? "updated" : "created",
    summary: confirming
      ? `${me.name} confirmed purchase order ${number} to ${supplier.name} for ${formatFils(subtotalFils + vatFils)}`
      : `${me.name} ${existing ? "updated" : "saved"} ${number ?? "a draft purchase order"} for ${supplier.name}`,
  });
  refresh(id, supplier.id);
  await flashDone(confirming ? `Purchase order ${number} confirmed.` : existing ? "Purchase order updated." : "Draft saved. Confirm it when you are ready.");
  redirect(`/purchases/orders/${id}`);
}

export async function cancelPurchaseOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const po = /^[0-9a-f-]{36}$/.test(id) ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) }) : undefined;
  if (!po) return { message: "That purchase order no longer exists." };
  if (await poLocked(po.id)) return { message: "Goods or a bill are already recorded against it, so it stays." };
  const [{ n: sent }] = await db.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.poId, po.id));
  if (sent > 0) return { message: "Fabric was sent against it, so it stays." };
  if (po.status === "draft") {
    await db.batch([db.delete(poLines).where(eq(poLines.poId, po.id)), db.delete(purchaseOrders).where(eq(purchaseOrders.id, po.id))]);
    await logActivity({ actor: me, entityType: "purchase_order", entityId: po.id, action: "status_changed", summary: `${me.name} deleted a draft purchase order` });
    refresh(undefined, po.supplierId);
    await flashDone("Draft deleted.");
    redirect("/purchases/orders");
  }
  await db.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, po.id));
  await logActivity({ actor: me, entityType: "purchase_order", entityId: po.id, action: "status_changed", summary: `${me.name} cancelled purchase order ${po.number}` });
  refresh(po.id, po.supplierId);
  return flashDone(`Purchase order ${po.number} cancelled.`);
}

/* ---------- Goods received ---------- */

const receiveSchema = z.object({
  poId: uuid,
  date: isoDate,
  notes: z.string().trim().max(1000).optional().default(""),
  lines: z.array(z.object({ poLineId: uuid, qty: z.union([z.string(), z.number()]) })),
});

export async function receiveGoods(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = receiveSchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the quantities.", errors: issuesToErrors(parsed.error) };
  const { poId, lines, notes } = parsed.data;
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) });
  if (!po || po.status !== "sent") return { message: po?.status === "draft" ? "Confirm the purchase order first." : "This purchase order cannot receive goods." };
  const progress = await poLineProgress(poId);
  const errors: Record<string, string[]> = {};
  const chosen: { line: (typeof progress)[number]; qty: number }[] = [];
  for (const l of lines) {
    const raw = String(l.qty ?? "").trim();
    if (!raw) continue;
    const qty = parseCenti(raw);
    const line = progress.find((p) => p.id === l.poLineId);
    if (!line) errors[`line.${l.poLineId}`] = ["That line is no longer on the purchase order."];
    else if (qty === null) errors[`line.${l.poLineId}`] = ["Enter a quantity like 12 or 12.50."];
    else if (line.unit === "pcs" && qty % 100 !== 0) errors[`line.${l.poLineId}`] = ["Whole pieces only."];
    else if (qty > Math.max(0, line.qtyCenti - line.receivedCenti) * 2 && qty > 0) errors[`line.${l.poLineId}`] = ["That is far more than was ordered. Check the number."];
    else if (qty > 0) chosen.push({ line, qty });
  }
  if (Object.keys(errors).length) return { message: "Some quantities need fixing.", errors };
  if (!chosen.length) return { message: "Enter what arrived." };

  const receiptId = randomUUID();
  const date = parsed.data.date ?? todayISO();
  const batch: BatchItem<"pg">[] = [
    db.insert(goodsReceipts).values({ id: receiptId, poId, receivedDate: date, notes: notes || null, createdBy: me.id }),
    db.insert(goodsReceiptLines).values(chosen.map((c) => ({ receiptId, poLineId: c.line.id, qtyCenti: c.qty, createdBy: me.id }))),
  ];
  const stock = chosen.filter((c) => c.line.fabricId && c.line.unit === "m");
  if (stock.length) {
    batch.push(
      db.insert(stockMovements).values(
        stock.map((c) => ({ fabricId: c.line.fabricId!, kind: "received" as const, qtyCenti: c.qty, movedOn: date, receiptId, poId, note: po.number, createdBy: me.id })),
      ),
    );
  }
  await db.batch(batch as Batch);
  await logActivity({
    actor: me,
    entityType: "purchase_order",
    entityId: poId,
    action: "updated",
    summary: `${me.name} received ${chosen.map((c) => `${formatQty(c.qty, c.line.unit)} ${c.line.description}`).join(", ")} on ${po.number}`,
  });
  refresh(poId, po.supplierId);
  await flashDone(stock.length ? "Goods received. Fabric added to stock." : "Goods received.");
  redirect(`/purchases/orders/${poId}`);
}

/* ---------- Fabric out: taken for a task, sent to a stitching unit ---------- */

const fabricOutSchema = z.object({
  fabricId: uuid,
  metres: qtySchema.refine((v) => v > 0, "More than 0."),
  date: isoDate,
  note: z.string().trim().max(300).optional().default(""),
});

async function stockWarning(fabricId: string, takingCenti: number) {
  const left = (await stockFor([fabricId])).get(fabricId) ?? 0;
  return left - takingCenti < 0 ? ` Stock shows ${formatQty(left - takingCenti)} now. Receive or adjust the fabric to fix it.` : "";
}

/** "Fabric taken" on a task: owner or the tailor doing it. Metres come prefilled and stay editable. */
export async function takeFabric(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireUser();
  const taskId = text(fd, "taskId");
  const parsed = fabricOutSchema.safeParse({ fabricId: text(fd, "fabricId"), metres: text(fd, "metres"), date: text(fd, "date"), note: text(fd, "note") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const task = /^[0-9a-f-]{36}$/.test(taskId) ? await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) }) : undefined;
  if (!task) return { message: "That task no longer exists." };
  if (me.role !== "owner" && task.tailorId !== me.id) return { message: "Only the tailor on this task or an owner can do this." };
  const fabric = await db.query.fabrics.findFirst({ where: eq(fabrics.id, parsed.data.fabricId) });
  if (!fabric) return { errors: { fabricId: ["Pick the fabric."] } };
  const warn = await stockWarning(fabric.id, parsed.data.metres);
  await db.insert(stockMovements).values({
    fabricId: fabric.id,
    kind: "taken",
    qtyCenti: -parsed.data.metres,
    movedOn: parsed.data.date ?? todayISO(),
    taskId: task.id,
    note: parsed.data.note || null,
    createdBy: me.id,
  });
  await logActivity({ actor: me, entityType: "task", entityId: task.id, action: "updated", summary: `${me.name} took ${formatQty(parsed.data.metres)} of ${fabric.name} for a task` });
  revalidatePath(`/workshop/tasks/${task.id}`);
  revalidatePath("/workshop");
  revalidatePath(`/purchases/fabrics/${fabric.id}`);
  revalidatePath("/purchases/fabrics");
  return { ok: true, message: `${formatQty(parsed.data.metres)} of ${fabric.name} taken.${warn}`, savedAt: Date.now() };
}

/** "Fabric sent" on an outsourcing PO: fabric leaves the shop with the work. */
export async function sendFabric(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const poId = text(fd, "poId");
  const parsed = fabricOutSchema.safeParse({ fabricId: text(fd, "fabricId"), metres: text(fd, "metres"), date: text(fd, "date"), note: text(fd, "note") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const po = /^[0-9a-f-]{36}$/.test(poId) ? await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, poId) }) : undefined;
  if (!po || po.kind !== "outsourcing" || po.status === "cancelled") return { message: "Fabric is sent against an outsourcing purchase order." };
  const [fabric, supplier] = await Promise.all([
    db.query.fabrics.findFirst({ where: eq(fabrics.id, parsed.data.fabricId) }),
    db.query.suppliers.findFirst({ where: eq(suppliers.id, po.supplierId) }),
  ]);
  if (!fabric) return { errors: { fabricId: ["Pick the fabric."] } };
  const warn = await stockWarning(fabric.id, parsed.data.metres);
  await db.insert(stockMovements).values({
    fabricId: fabric.id,
    kind: "sent",
    qtyCenti: -parsed.data.metres,
    movedOn: parsed.data.date ?? todayISO(),
    poId: po.id,
    note: parsed.data.note || `Sent to ${supplier?.name ?? "the unit"}`,
    createdBy: me.id,
  });
  await logActivity({ actor: me, entityType: "purchase_order", entityId: po.id, action: "updated", summary: `${me.name} sent ${formatQty(parsed.data.metres)} of ${fabric.name} to ${supplier?.name}` });
  refresh(po.id, po.supplierId);
  revalidatePath(`/purchases/fabrics/${fabric.id}`);
  return { ok: true, message: `${formatQty(parsed.data.metres)} of ${fabric.name} sent to ${supplier?.name}.${warn}`, savedAt: Date.now() };
}

/** Count the roll and set the real number. The difference is logged with the reason. */
export async function adjustStock(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = z
    .object({ fabricId: uuid, counted: z.union([z.string(), z.number()]), reason: z.string().trim().min(3, "Say why, for example: counted the roll.") })
    .safeParse({ fabricId: text(fd, "fabricId"), counted: text(fd, "counted"), reason: text(fd, "reason") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const counted = parseCenti(String(parsed.data.counted));
  if (counted === null) return { errors: { counted: ["Enter metres like 40 or 40.50."] } };
  const fabric = await db.query.fabrics.findFirst({ where: eq(fabrics.id, parsed.data.fabricId) });
  if (!fabric) return { message: "That fabric no longer exists." };
  const [{ n: moves }] = await db.select({ n: sql<number>`count(*)::int` }).from(stockMovements).where(eq(stockMovements.fabricId, fabric.id));
  const now = (await stockFor([fabric.id])).get(fabric.id) ?? 0;
  const diff = counted - now;
  if (diff === 0) return { ok: true, message: "Stock already matches.", savedAt: Date.now() };
  await db.insert(stockMovements).values({
    fabricId: fabric.id,
    kind: moves === 0 ? "opening" : "adjusted",
    qtyCenti: diff,
    movedOn: todayISO(),
    note: parsed.data.reason,
    createdBy: me.id,
  });
  await logActivity({
    actor: me,
    entityType: "fabric",
    entityId: fabric.id,
    action: "updated",
    summary: `${me.name} set ${fabric.name} stock to ${formatQty(counted)} (${diff > 0 ? "+" : ""}${formatQty(diff)}): ${parsed.data.reason}`,
  });
  revalidatePath(`/purchases/fabrics/${fabric.id}`);
  revalidatePath("/purchases/fabrics");
  return { ok: true, message: `${fabric.name} stock set to ${formatQty(counted)}.`, savedAt: Date.now() };
}

/** Fabrics for an order line's task when the line has none set. */
export async function fabricChoices() {
  await requireUser();
  const rows = await db.select({ id: fabrics.id, name: fabrics.name, colour: fabrics.colour }).from(fabrics).where(sql`${fabrics.deletedAt} is null`).orderBy(fabrics.name);
  return rows.map((r) => ({ id: r.id, label: [r.name, r.colour].filter(Boolean).join(", ") }));
}

/** Used by the order editor to warn about short stock. */
export async function fabricStock(ids: string[]) {
  await requireOwner();
  const clean = ids.filter((i) => /^[0-9a-f-]{36}$/.test(i)).slice(0, 100);
  return Object.fromEntries(await stockFor(clean));
}

