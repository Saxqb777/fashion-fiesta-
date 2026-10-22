"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  creditNoteLines,
  creditNotes,
  customers,
  deliveryNoteLines,
  deliveryNotes,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  salesOrders,
  settings,
  suppliers,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/dates";
import { flashDone } from "@/lib/flash";
import { moneySchema, text, type FormState } from "@/lib/forms";
import { invoiceFigures, dueDateFor, unallocatedByPayment } from "@/lib/ledger";
import { documentTotals, lineAmounts } from "@/lib/lines";
import { formatFils } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/numbering";
import { orderLineProgress } from "@/lib/order-progress";
import { refreshOrderStage, refreshOrdersForInvoices } from "@/lib/order-stage";
import { isoDate, issuesToErrors, uuidOrNull } from "@/lib/payload";
import { resolveProduct } from "@/lib/products-auto";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];
type Owner = Awaited<ReturnType<typeof requireOwner>>;
const uuid = z.string().regex(/^[0-9a-f-]{36}$/, "Invalid reference.");

function readJson(fd: FormData) {
  try {
    return JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return {};
  }
}

function refreshMoney(customerId: string, orderId?: string | null) {
  revalidatePath("/money", "layout");
  revalidatePath("/today");
  revalidatePath("/orders");
  revalidatePath(`/customers/${customerId}`);
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

/* ---------- Delivery notes ---------- */

const deliverySchema = z.object({
  orderId: uuid,
  date: isoDate,
  notes: z.string().trim().max(1000).optional().default(""),
  lines: z.array(z.object({ soLineId: uuid, qty: z.number().int().min(0) })),
});

export async function createDeliveryNote(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = deliverySchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the quantities.", errors: issuesToErrors(parsed.error) };
  const { orderId, lines, notes } = parsed.data;
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order || order.stage === "draft") return { message: "Confirm the order before delivering it." };
  const progress = await orderLineProgress(orderId);
  const errors: Record<string, string[]> = {};
  const chosen = lines.filter((l) => l.qty > 0);
  for (const l of chosen) {
    const p = progress.find((x) => x.id === l.soLineId);
    if (!p) errors[`line.${l.soLineId}`] = ["That line is no longer on the order."];
    else if (l.qty > p.qty - p.delivered) errors[`line.${l.soLineId}`] = [`Only ${p.qty - p.delivered} left to deliver.`];
  }
  if (!chosen.length) return { message: "Enter how many pieces are going out." };
  if (Object.keys(errors).length) return { message: "Some quantities are more than what is left.", errors };

  const id = randomUUID();
  const number = await nextDocumentNumber("delivery_note");
  await db.batch([
    db.insert(deliveryNotes).values({
      id,
      number,
      orderId,
      customerId: order.customerId,
      branchId: order.branchId,
      deliveryDate: parsed.data.date ?? todayISO(),
      customerPoNumber: order.customerPoNumber,
      notes: notes || null,
      createdBy: me.id,
    }),
    db.insert(deliveryNoteLines).values(
      chosen.map((l) => ({ deliveryNoteId: id, soLineId: l.soLineId, description: progress.find((p) => p.id === l.soLineId)!.description, qty: l.qty, createdBy: me.id })),
    ),
  ]);
  await refreshOrderStage(orderId);
  await logActivity({ actor: me, entityType: "sales_order", entityId: orderId, action: "created", summary: `${me.name} made delivery note ${number} for ${order.number}` });
  refreshMoney(order.customerId, orderId);
  await flashDone(`Delivery note ${number} made.`);
  redirect(`/orders/${orderId}`);
}

/* ---------- Invoices ---------- */

const invoiceSchema = z.object({
  orderId: uuid,
  date: isoDate,
  notes: z.string().trim().max(1000).optional().default(""),
  lines: z
    .array(
      z.object({
        soLineId: uuidOrNull,
        productId: uuidOrNull,
        description: z.string().trim().min(1, "Type what this line is."),
        qty: z.number({ message: "Enter a quantity." }).int("Whole pieces only.").min(0),
        unitPrice: moneySchema,
      }),
    )
    .min(1, "Add at least one line."),
});

type InvoiceInput = z.infer<typeof invoiceSchema>;

/** Issues a Tax Invoice from an order. Deposits on the order are applied to it automatically. */
async function issueInvoice(input: InvoiceInput, me: Owner): Promise<{ id?: string; number?: string; error?: string; errors?: Record<string, string[]> }> {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, input.orderId) });
  if (!order || order.stage === "draft") return { error: "Confirm the order before invoicing it." };
  const progress = await orderLineProgress(order.id);
  const errors: Record<string, string[]> = {};
  const chosen = input.lines.filter((l) => l.qty > 0);
  input.lines.forEach((l, i) => {
    if (!l.soLineId || l.qty === 0) return;
    const p = progress.find((x) => x.id === l.soLineId);
    if (!p) errors[`lines.${i}.qty`] = ["That line is no longer on the order."];
    else if (l.qty > p.qty - p.invoiced) errors[`lines.${i}.qty`] = [`Only ${p.qty - p.invoiced} left to invoice.`];
  });
  if (!chosen.length) return { error: "Enter at least one quantity to invoice." };
  if (Object.keys(errors).length) return { error: "Some quantities are more than what is left to invoice.", errors };

  const s = await getSettings();
  const cache = new Map<string, string>();
  const rows = [];
  for (const [i, l] of chosen.entries()) {
    const product = await resolveProduct({ productId: l.productId, description: l.description, unitPriceFils: l.unitPrice }, me.id, cache);
    rows.push({ sort: i, soLineId: l.soLineId, productId: product.id, description: l.description, qty: l.qty, unitPriceFils: l.unitPrice, vatRateBp: s.vatRateBp, ...lineAmounts(l.qty, l.unitPrice, s.vatRateBp) });
  }
  const totals = documentTotals(rows);
  const invoiceDate = input.date ?? todayISO();
  const id = randomUUID();
  const number = await nextDocumentNumber("invoice");

  // Deposits taken on this order, still unapplied, go against this invoice first.
  // Then any credit on account (money received with nothing left to pay at the time).
  const [deposits, credit] = await Promise.all([
    db.select({ id: payments.id }).from(payments).where(and(eq(payments.orderId, order.id), eq(payments.isDeposit, true))).orderBy(payments.paymentDate, payments.createdAt),
    db.select({ id: payments.id }).from(payments).where(and(eq(payments.customerId, order.customerId), eq(payments.isDeposit, false))).orderBy(payments.paymentDate, payments.createdAt),
  ]);
  const left = await unallocatedByPayment([...deposits, ...credit].map((d) => d.id));
  let room = totals.totalFils;
  const allocations: { paymentId: string; amountFils: number }[] = [];
  for (const d of [...deposits, ...credit]) {
    const amt = Math.min(left.get(d.id) ?? 0, room);
    if (amt > 0) {
      allocations.push({ paymentId: d.id, amountFils: amt });
      room -= amt;
    }
  }

  const batch: BatchItem<"pg">[] = [
    db.insert(invoices).values({
      id,
      kind: "tax_invoice",
      number,
      customerId: order.customerId,
      branchId: order.branchId,
      orderId: order.id,
      invoiceDate,
      dueDate: await dueDateFor(order.customerId, invoiceDate),
      customerPoNumber: order.customerPoNumber,
      notes: input.notes || null,
      ...totals,
      createdBy: me.id,
    }),
    db.insert(invoiceLines).values(rows.map((r) => ({ invoiceId: id, ...r, totalFils: undefined, createdBy: me.id }))),
  ];
  if (allocations.length) batch.push(db.insert(paymentAllocations).values(allocations.map((a) => ({ ...a, invoiceId: id, createdBy: me.id }))));
  await db.batch(batch as Batch);
  await refreshOrderStage(order.id);
  await logActivity({
    actor: me,
    entityType: "invoice",
    entityId: id,
    action: "created",
    summary: `${me.name} issued Tax Invoice ${number} for ${formatFils(totals.totalFils)}${allocations.length ? `, ${formatFils(totals.totalFils - room)} paid earlier set against it` : ""}`,
  });
  refreshMoney(order.customerId, order.id);
  return { id, number };
}

export async function createInvoice(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = invoiceSchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the highlighted lines.", errors: issuesToErrors(parsed.error) };
  const res = await issueInvoice(parsed.data, me);
  if (!res.id) return { message: res.error, errors: res.errors };
  await flashDone(`Tax Invoice ${res.number} issued.`);
  redirect(`/money/invoices/${res.id}`);
}

/* ---------- Walk in: invoice everything and take payment in one step ---------- */

export async function invoiceAndPay(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const orderId = text(fd, "orderId");
  const method = z.enum(["cash", "card", "bank_transfer", "cheque"]).safeParse(text(fd, "method"));
  if (!method.success) return { errors: { method: ["Pick how they paid."] } };
  const order = /^[0-9a-f-]{36}$/.test(orderId) ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) }) : undefined;
  if (!order || order.stage === "draft") return { message: "Confirm the order first." };
  const progress = await orderLineProgress(orderId);
  const remaining = progress.filter((l) => l.qty - l.invoiced > 0);
  if (!remaining.length) return { message: "Everything on this order is already invoiced." };
  const res = await issueInvoice(
    {
      orderId,
      date: todayISO(),
      notes: "",
      lines: remaining.map((l) => ({ soLineId: l.id, productId: l.productId, description: l.description, qty: l.qty - l.invoiced, unitPrice: l.unitPriceFils })),
    },
    me,
  );
  if (!res.id) return { message: res.error };
  const fig = (await invoiceFigures([res.id])).get(res.id)!;
  let paymentId: string | null = null;
  if (fig.balanceFils > 0) {
    paymentId = randomUUID();
    const number = await nextDocumentNumber("receipt");
    await db.batch([
      db.insert(payments).values({ id: paymentId, number, customerId: order.customerId, orderId, paymentDate: todayISO(), amountFils: fig.balanceFils, method: method.data, createdBy: me.id }),
      db.insert(paymentAllocations).values({ paymentId, invoiceId: res.id, amountFils: fig.balanceFils, createdBy: me.id }),
    ]);
    await logActivity({ actor: me, entityType: "payment", entityId: paymentId, action: "created", summary: `${me.name} took ${formatFils(fig.balanceFils)} by ${method.data.replace("_", " ")} for ${res.number}` });
  }
  await db.update(salesOrders).set({ deliveredAt: order.deliveredAt ?? new Date() }).where(eq(salesOrders.id, orderId));
  await refreshOrderStage(orderId);
  refreshMoney(order.customerId, orderId);
  redirect(paymentId ? `/money/payments/${paymentId}?celebrate=paid` : `/money/invoices/${res.id}?celebrate=paid`);
}

/* ---------- Credit notes ---------- */

const creditSchema = z.object({
  invoiceId: uuid,
  date: isoDate,
  reason: z.string().trim().min(3, "Say why, it prints on the credit note."),
  lines: z.array(z.object({ invoiceLineId: uuid, qty: z.number().int().min(0) })),
});

export async function createCreditNote(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = creditSchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the form.", errors: issuesToErrors(parsed.error) };
  const { invoiceId, reason } = parsed.data;
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!invoice || invoice.kind !== "tax_invoice") return { message: "Credit notes are made against a Tax Invoice." };
  const [lines, credited] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)),
    db
      .select({ id: creditNoteLines.invoiceLineId, n: sql<number>`sum(${creditNoteLines.qty})::int` })
      .from(creditNoteLines)
      .innerJoin(creditNotes, eq(creditNotes.id, creditNoteLines.creditNoteId))
      .where(eq(creditNotes.invoiceId, invoiceId))
      .groupBy(creditNoteLines.invoiceLineId),
  ]);
  const errors: Record<string, string[]> = {};
  const chosen = parsed.data.lines.filter((l) => l.qty > 0);
  for (const l of chosen) {
    const line = lines.find((x) => x.id === l.invoiceLineId);
    const already = credited.find((c) => c.id === l.invoiceLineId)?.n ?? 0;
    if (!line) errors[`line.${l.invoiceLineId}`] = ["That line is not on this invoice."];
    else if (l.qty > line.qty - already) errors[`line.${l.invoiceLineId}`] = [`Only ${line.qty - already} can still be credited.`];
  }
  if (!chosen.length) return { message: "Enter how many pieces to credit." };
  if (Object.keys(errors).length) return { message: "Some quantities are more than the invoice allows.", errors };

  const rows = chosen.map((l) => {
    const line = lines.find((x) => x.id === l.invoiceLineId)!;
    return { invoiceLineId: line.id, description: line.description, qty: l.qty, unitPriceFils: line.unitPriceFils, vatRateBp: line.vatRateBp, ...lineAmounts(l.qty, line.unitPriceFils, line.vatRateBp) };
  });
  const totals = documentTotals(rows);
  const id = randomUUID();
  const number = await nextDocumentNumber("credit_note");
  await db.batch([
    db.insert(creditNotes).values({ id, number, invoiceId, customerId: invoice.customerId, creditDate: parsed.data.date ?? todayISO(), reason, ...totals, createdBy: me.id }),
    db.insert(creditNoteLines).values(rows.map((r) => ({ creditNoteId: id, ...r, totalFils: undefined, createdBy: me.id }))),
  ]);
  await refreshOrdersForInvoices([invoiceId]);
  await logActivity({ actor: me, entityType: "invoice", entityId: invoiceId, action: "created", summary: `${me.name} issued Credit Note ${number} for ${formatFils(totals.totalFils)} against ${invoice.number}: ${reason}` });
  refreshMoney(invoice.customerId, invoice.orderId);
  await flashDone(`Credit Note ${number} issued.`);
  redirect(`/money/invoices/${invoiceId}`);
}

/* ---------- Payments ---------- */

const paymentSchema = z.object({
  customerId: uuid,
  orderId: uuidOrNull,
  deposit: z.boolean().default(false),
  date: isoDate,
  amount: moneySchema.refine((v) => v > 0, "Enter the amount received."),
  method: z.enum(["cash", "card", "bank_transfer", "cheque"], { message: "Pick how they paid." }),
  reference: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  allocations: z.array(z.object({ invoiceId: uuid, amount: moneySchema })).default([]),
});

export async function recordPayment(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = paymentSchema.safeParse(readJson(fd));
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const p = parsed.data;
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, p.customerId) });
  if (!customer) return { message: "That customer no longer exists." };
  if (p.orderId) {
    const order = await db.query.salesOrders.findFirst({ where: and(eq(salesOrders.id, p.orderId), eq(salesOrders.customerId, customer.id)) });
    if (!order) return { message: "That order does not belong to this customer." };
  }
  const allocs = p.allocations.filter((a) => a.amount > 0);
  const sum = allocs.reduce((s, a) => s + a.amount, 0);
  if (sum > p.amount) return { message: `You set ${formatFils(sum)} against invoices but received ${formatFils(p.amount)}.` };
  if (allocs.length) {
    const own = await db.select({ id: invoices.id }).from(invoices).where(and(inArray(invoices.id, allocs.map((a) => a.invoiceId)), eq(invoices.customerId, customer.id)));
    if (own.length !== new Set(allocs.map((a) => a.invoiceId)).size) return { message: "An invoice does not belong to this customer." };
    const figures = await invoiceFigures(allocs.map((a) => a.invoiceId));
    for (const a of allocs) {
      const f = figures.get(a.invoiceId)!;
      if (a.amount > f.balanceFils) return { message: `That is more than the ${formatFils(f.balanceFils)} still due on one invoice.` };
    }
  }
  const id = randomUUID();
  const number = await nextDocumentNumber("receipt");
  const batch: BatchItem<"pg">[] = [
    db.insert(payments).values({
      id,
      number,
      customerId: customer.id,
      orderId: p.orderId,
      isDeposit: Boolean(p.orderId && p.deposit),
      paymentDate: p.date ?? todayISO(),
      amountFils: p.amount,
      method: p.method,
      reference: p.reference || null,
      notes: p.notes || null,
      createdBy: me.id,
    }),
  ];
  if (allocs.length) batch.push(db.insert(paymentAllocations).values(allocs.map((a) => ({ paymentId: id, invoiceId: a.invoiceId, amountFils: a.amount, createdBy: me.id }))));
  await db.batch(batch as Batch);
  await refreshOrdersForInvoices(allocs.map((a) => a.invoiceId));
  const figures = await invoiceFigures(allocs.map((a) => a.invoiceId));
  const clearedOne = [...figures.values()].some((f) => f.balanceFils <= 0);
  await logActivity({
    actor: me,
    entityType: "payment",
    entityId: id,
    action: "created",
    summary: `${me.name} received ${formatFils(p.amount)} from ${customer.name} by ${p.method.replace("_", " ")}${p.deposit && p.orderId ? " as a deposit" : ""}`,
  });
  refreshMoney(customer.id, p.orderId);
  redirect(`/money/payments/${id}?celebrate=${clearedOne ? "paid" : "payment"}`);
}

/* ---------- Opening balances ---------- */

export async function saveOpeningCash(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const amount = moneySchema.safeParse(text(fd, "cash"));
  const date = isoDate.safeParse(text(fd, "date"));
  if (!amount.success) return { errors: { cash: [amount.error.issues[0]?.message ?? "Enter an amount."] } };
  if (!date.success || !date.data) return { errors: { date: ["Pick the go live date."] } };
  const s = await getSettings();
  await db.update(settings).set({ openingCashFils: amount.data, openingDate: date.data }).where(eq(settings.id, s.id));
  await logActivity({ actor: me, entityType: "settings", entityId: s.id, action: "updated", summary: `${me.name} set opening cash to ${formatFils(amount.data)} on ${date.data}` });
  revalidatePath("/settings/opening");
  revalidatePath("/setup/opening");
  return { ok: true, message: "Opening cash saved.", savedAt: Date.now() };
}

export async function addOpeningBalance(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = z
    .object({ customerId: uuid, amount: moneySchema.refine((v) => v > 0, "Enter what they owe."), since: isoDate })
    .safeParse({ customerId: text(fd, "customerId"), amount: text(fd, "amount"), since: text(fd, "since") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const { customerId, amount, since } = parsed.data;
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), isNull(customers.deletedAt)) });
  if (!customer) return { errors: { customerId: ["Pick a customer."] } };
  const date = since ?? todayISO();
  const [row] = await db
    .insert(invoices)
    .values({ kind: "opening_balance", customerId, invoiceDate: date, dueDate: await dueDateFor(customerId, date), notes: "Opening balance", subtotalFils: amount, vatFils: 0, totalFils: amount, createdBy: me.id })
    .returning({ id: invoices.id });
  await logActivity({ actor: me, entityType: "invoice", entityId: row.id, action: "created", summary: `${me.name} entered an opening balance of ${formatFils(amount)} for ${customer.name}` });
  refreshMoney(customerId);
  revalidatePath("/settings/opening");
  revalidatePath("/setup/opening");
  return { ok: true, message: `${customer.name} owes ${formatFils(amount)}. Saved.`, savedAt: Date.now() };
}

export async function removeOpeningBalance(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || inv.kind !== "opening_balance") return { message: "That opening balance no longer exists." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, id));
  if (n > 0) return { message: "Payments are already set against it, so it stays." };
  await db.delete(invoices).where(eq(invoices.id, id));
  await logActivity({ actor: me, entityType: "invoice", entityId: id, action: "status_changed", summary: `${me.name} removed an opening balance of ${formatFils(inv.totalFils)}` });
  refreshMoney(inv.customerId);
  revalidatePath("/settings/opening");
  revalidatePath("/setup/opening");
  return { ok: true, message: "Opening balance removed.", savedAt: Date.now() };
}

export async function saveSupplierOpening(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = z
    .object({ supplierId: uuid, amount: moneySchema, since: isoDate })
    .safeParse({ supplierId: text(fd, "supplierId"), amount: text(fd, "amount"), since: text(fd, "since") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, parsed.data.supplierId) });
  if (!supplier) return { errors: { supplierId: ["Pick a supplier."] } };
  await db
    .update(suppliers)
    .set({ openingBalanceFils: parsed.data.amount, openingBalanceDate: parsed.data.amount ? (parsed.data.since ?? todayISO()) : null })
    .where(eq(suppliers.id, supplier.id));
  await logActivity({ actor: me, entityType: "supplier", entityId: supplier.id, action: "updated", summary: `${me.name} set the opening balance owed to ${supplier.name} to ${formatFils(parsed.data.amount)}` });
  revalidatePath("/settings/opening");
  revalidatePath("/setup/opening");
  revalidatePath(`/purchases/suppliers/${supplier.id}`);
  return { ok: true, message: parsed.data.amount ? `You owe ${supplier.name} ${formatFils(parsed.data.amount)}. Saved.` : `${supplier.name} cleared.`, savedAt: Date.now() };
}

/** Open invoices for the payment screen, oldest due first. */
export async function getOpenInvoices(customerId: string) {
  await requireOwner();
  if (!/^[0-9a-f-]{36}$/.test(customerId)) return [];
  const { openInvoicesFor } = await import("@/lib/ledger");
  const rows = await openInvoicesFor(customerId);
  return rows.map((r) => ({ id: r.id, label: r.kind === "opening_balance" ? "Opening balance" : (r.number ?? "Invoice"), dueDate: r.dueDate, balanceFils: r.balanceFils }));
}
