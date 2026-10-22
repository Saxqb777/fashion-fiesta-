"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { purchaseOrders, supplierBillLines, supplierBills, supplierPaymentAllocations, supplierPayments, suppliers } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { cashEntry, potFor } from "@/lib/cash";
import { todayISO } from "@/lib/dates";
import { flashDone } from "@/lib/flash";
import { moneySchema, optionalTrn, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { billFigures, poLineProgress, supplierDueDate } from "@/lib/payables";
import { isoDate, issuesToErrors, uuidOrNull } from "@/lib/payload";
import { formatQty, lineAmountsCenti, parseCenti } from "@/lib/qty";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];
const uuid = z.string().regex(/^[0-9a-f-]{36}$/, "Invalid reference.");

function readJson(fd: FormData) {
  try {
    return JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return {};
  }
}

function refresh(supplierId: string, poId?: string | null) {
  revalidatePath("/purchases", "layout");
  revalidatePath("/today");
  revalidatePath(`/purchases/suppliers/${supplierId}`);
  if (poId) revalidatePath(`/purchases/orders/${poId}`);
}

/* ---------- Supplier bills ---------- */

const billSchema = z.object({
  supplierId: uuid,
  poId: uuidOrNull,
  billNumber: z.string().trim().max(60).optional().default(""),
  billDate: isoDate,
  dueDate: isoDate.optional().default(""),
  supplierTrn: optionalTrn,
  notes: z.string().trim().max(1000).optional().default(""),
  vat: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        poLineId: uuidOrNull,
        description: z.string().trim().min(1, "Type what this line is."),
        unit: z.enum(["m", "pcs"]),
        qty: z.union([z.string(), z.number()]),
        unitPrice: moneySchema,
      }),
    )
    .min(1, "Add at least one line."),
});

export async function saveSupplierBill(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = billSchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const b = parsed.data;
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, b.supplierId) });
  if (!supplier) return { errors: { supplierId: ["Pick a supplier."] } };
  const po = b.poId ? await db.query.purchaseOrders.findFirst({ where: and(eq(purchaseOrders.id, b.poId), eq(purchaseOrders.supplierId, supplier.id)) }) : undefined;
  if (b.poId && (!po || po.status !== "sent")) return { message: "That purchase order cannot be billed." };
  const progress = po ? await poLineProgress(po.id) : [];

  const errors: Record<string, string[]> = {};
  const settings = await getSettings();
  const vatRateBp = b.vat ? settings.vatRateBp : 0;
  const rows = [];
  for (const [i, l] of b.lines.entries()) {
    const raw = String(l.qty ?? "").trim();
    if (!raw) continue;
    const qty = parseCenti(raw);
    if (qty === null || qty <= 0) {
      errors[`lines.${i}.qty`] = ["Enter a quantity like 12 or 12.50."];
      continue;
    }
    if (l.poLineId) {
      const pl = progress.find((p) => p.id === l.poLineId);
      if (!pl) errors[`lines.${i}.qty`] = ["That line is not on the purchase order."];
      else if (qty > pl.qtyCenti - pl.billedCenti) errors[`lines.${i}.qty`] = [`Only ${formatQty(Math.max(0, pl.qtyCenti - pl.billedCenti), pl.unit)} left to bill.`];
    }
    const { netFils, vatFils } = lineAmountsCenti(qty, l.unitPrice, vatRateBp);
    rows.push({ sort: i, poLineId: l.poLineId, description: l.description, unit: l.unit, qtyCenti: qty, unitPriceFils: l.unitPrice, vatRateBp, netFils, vatFils });
  }
  if (Object.keys(errors).length) return { message: "Some lines need fixing.", errors };
  if (!rows.length) return { message: "Enter at least one quantity." };
  if (vatRateBp && !b.supplierTrn && !supplier.trn) {
    return { errors: { supplierTrn: ["VAT can only be claimed back with the supplier's TRN. Type it from their bill, or untick VAT."] } };
  }

  const subtotalFils = rows.reduce((s, r) => s + r.netFils, 0);
  const vatFils = rows.reduce((s, r) => s + r.vatFils, 0);
  const billDate = b.billDate ?? todayISO();
  const id = randomUUID();
  await db.batch([
    db.insert(supplierBills).values({
      id,
      kind: "bill",
      supplierId: supplier.id,
      poId: po?.id ?? null,
      billNumber: b.billNumber || null,
      billDate,
      dueDate: b.dueDate ?? (await supplierDueDate(supplier.id, billDate)),
      supplierTrn: b.supplierTrn ?? supplier.trn,
      notes: b.notes || null,
      subtotalFils,
      vatFils,
      totalFils: subtotalFils + vatFils,
      createdBy: me.id,
    }),
    db.insert(supplierBillLines).values(rows.map((r) => ({ billId: id, ...r, createdBy: me.id }))),
  ]);
  // A supplier TRN typed from the bill is remembered for next time.
  if (b.supplierTrn && !supplier.trn) await db.update(suppliers).set({ trn: b.supplierTrn }).where(eq(suppliers.id, supplier.id));
  await logActivity({
    actor: me,
    entityType: "supplier_bill",
    entityId: id,
    action: "created",
    summary: `${me.name} entered ${supplier.name}'s bill ${b.billNumber || ""} for ${formatFils(subtotalFils + vatFils)}${po ? ` against ${po.number}` : ""}`,
  });
  refresh(supplier.id, po?.id);
  await flashDone(`Bill from ${supplier.name} saved.`);
  redirect(`/purchases/bills/${id}`);
}

/* ---------- Supplier payments ---------- */

const paySchema = z.object({
  supplierId: uuid,
  date: isoDate,
  amount: moneySchema.refine((v) => v > 0, "Enter the amount paid."),
  method: z.enum(["cash", "card", "bank_transfer", "cheque"], { message: "Pick how you paid." }),
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  allocations: z.array(z.object({ billId: uuid, amount: moneySchema })).default([]),
});

export async function recordSupplierPayment(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = paySchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const p = parsed.data;
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, p.supplierId) });
  if (!supplier) return { message: "That supplier no longer exists." };
  const allocs = p.allocations.filter((a) => a.amount > 0);
  const sum = allocs.reduce((s, a) => s + a.amount, 0);
  if (sum > p.amount) return { message: `You set ${formatFils(sum)} against bills but paid ${formatFils(p.amount)}.` };
  if (allocs.length) {
    const own = await db.select({ id: supplierBills.id }).from(supplierBills).where(and(inArray(supplierBills.id, allocs.map((a) => a.billId)), eq(supplierBills.supplierId, supplier.id)));
    if (own.length !== new Set(allocs.map((a) => a.billId)).size) return { message: "A bill does not belong to this supplier." };
    const figures = await billFigures(allocs.map((a) => a.billId));
    for (const a of allocs) if (a.amount > figures.get(a.billId)!.balanceFils) return { message: `That is more than the ${formatFils(figures.get(a.billId)!.balanceFils)} still due on one bill.` };
  }
  const id = randomUUID();
  const batch: BatchItem<"pg">[] = [
    db.insert(supplierPayments).values({
      id,
      supplierId: supplier.id,
      paymentDate: p.date ?? todayISO(),
      amountFils: p.amount,
      method: p.method,
      reference: p.reference || null,
      notes: p.notes || null,
      createdBy: me.id,
    }),
    cashEntry({ date: p.date ?? todayISO(), pot: potFor(p.method), kind: "supplier_payment", amountFils: -p.amount, description: `Paid ${supplier.name}`, sourceType: "supplier_payment", sourceId: id, actorId: me.id }),
  ];
  if (allocs.length) batch.push(db.insert(supplierPaymentAllocations).values(allocs.map((a) => ({ paymentId: id, billId: a.billId, amountFils: a.amount, createdBy: me.id }))));
  await db.batch(batch as Batch);
  await logActivity({ actor: me, entityType: "supplier_payment", entityId: id, action: "created", summary: `${me.name} paid ${supplier.name} ${formatFils(p.amount)} by ${p.method.replace("_", " ")}` });
  const poIds = allocs.length
    ? (await db.selectDistinct({ poId: supplierBills.poId }).from(supplierBills).where(inArray(supplierBills.id, allocs.map((a) => a.billId)))).map((r) => r.poId)
    : [];
  refresh(supplier.id);
  for (const poId of poIds) if (poId) revalidatePath(`/purchases/orders/${poId}`);
  await flashDone(`Paid ${supplier.name} ${formatFils(p.amount)}.`);
  redirect(allocs.length === 1 ? `/purchases/bills/${allocs[0].billId}` : `/purchases/suppliers/${supplier.id}`);
}

