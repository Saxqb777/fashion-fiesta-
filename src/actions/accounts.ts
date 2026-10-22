"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  accountItems,
  accountStaff,
  customerBranches,
  customers,
  deliveryNoteLines,
  deliveryNotes,
  deliveryRuns,
  pieceTicks,
  salesOrders,
  suppliers,
} from "@/db/schema";
import { deliveryNotePieces, matchEmirate, pendingByBranch } from "@/lib/accounts";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { todayISO } from "@/lib/dates";
import { fieldErrors, moneySchema, optionalText, requiredName, text, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { nextDocumentNumber } from "@/lib/numbering";
import { refreshOrderStage } from "@/lib/order-stage";
import { isoDate } from "@/lib/payload";
import { resolveProduct } from "@/lib/products-auto";
import { requireOwner } from "@/lib/session";

type Result = { ok?: boolean; error?: string; message?: string; count?: number };
type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

function refresh(customerId: string) {
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

async function customerOf(id: string) {
  return isUuid(id) ? db.query.customers.findFirst({ where: eq(customers.id, id) }) : undefined;
}

/* ---------- The switch ---------- */

export async function setKeyAccount(customerId: string, on: boolean): Promise<Result> {
  const me = await requireOwner();
  const customer = await customerOf(customerId);
  if (!customer) return { error: "That customer no longer exists." };
  await db.update(customers).set({ isKeyAccount: on }).where(eq(customers.id, customer.id));
  await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: "updated", summary: `${me.name} ${on ? "made" : "removed"} ${customer.name} ${on ? "a key account" : "as a key account"}` });
  refresh(customer.id);
  return { ok: true };
}

/* ---------- Branches ---------- */

/** One tap confirm for branches loaded from a public source. */
export async function confirmBranches(customerId: string, branchIds: string[] | "all"): Promise<Result> {
  const me = await requireOwner();
  const customer = await customerOf(customerId);
  if (!customer) return { error: "That customer no longer exists." };
  const ids = branchIds === "all" ? null : branchIds.filter(isUuid);
  const rows = await db
    .update(customerBranches)
    .set({ verified: true })
    .where(and(eq(customerBranches.customerId, customer.id), eq(customerBranches.verified, false), ids ? inArray(customerBranches.id, ids) : undefined))
    .returning({ name: customerBranches.name });
  if (rows.length) {
    await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: "updated", summary: `${me.name} confirmed ${rows.length === 1 ? `branch ${rows[0].name}` : `${rows.length} branches`} of ${customer.name}` });
  }
  refresh(customer.id);
  return { ok: true, count: rows.length };
}

const branchRow = z.object({
  name: z.string().trim().min(2, "Name the branch."),
  emirate: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  contactName: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  deliveryInstructions: z.string().trim().optional().default(""),
});

/** Excel import. A name that already exists updates that branch, others are added. */
export async function importBranches(customerId: string, rows: unknown[]): Promise<Result> {
  const me = await requireOwner();
  const customer = await customerOf(customerId);
  if (!customer) return { error: "That customer no longer exists." };
  const parsed = z.array(branchRow).max(500).safeParse(rows);
  if (!parsed.success) return { error: "Some rows could not be read. Check the names." };
  const existing = await db.select().from(customerBranches).where(and(eq(customerBranches.customerId, customer.id), isNull(customerBranches.deletedAt)));
  let added = 0;
  let updated = 0;
  for (const r of parsed.data) {
    const values = {
      name: r.name,
      emirate: matchEmirate(r.emirate) ?? (r.emirate || null),
      address: r.address || null,
      contactName: r.contactName || null,
      phone: r.phone || null,
      deliveryInstructions: r.deliveryInstructions || null,
    };
    const match = existing.find((b) => b.name.trim().toLowerCase() === r.name.toLowerCase());
    if (match) {
      // Empty cells keep what is already saved.
      const patch = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
      await db.update(customerBranches).set({ ...patch, verified: true }).where(eq(customerBranches.id, match.id));
      updated++;
    } else {
      await db.insert(customerBranches).values({ ...values, customerId: customer.id, verified: true, createdBy: me.id });
      added++;
    }
  }
  await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: "updated", summary: `${me.name} imported branches for ${customer.name}: ${added} added, ${updated} updated` });
  refresh(customer.id);
  return { ok: true, count: added + updated, message: `${added} added, ${updated} updated.` };
}

/* ---------- Staff ---------- */

const staffSchema = z.object({
  name: requiredName("Enter their name."),
  branchId: z.string().optional().transform((v) => (isUuid(v) ? v : null)),
  role: optionalText,
  sizes: optionalText,
  notes: optionalText,
});

export async function saveStaff(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const customer = await customerOf(text(fd, "customerId"));
  if (!customer) return { message: "That customer no longer exists." };
  const id = text(fd, "id");
  const parsed = staffSchema.safeParse({ name: text(fd, "name"), branchId: text(fd, "branchId"), role: text(fd, "role"), sizes: text(fd, "sizes"), notes: text(fd, "notes") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (isUuid(id)) {
    await db.update(accountStaff).set(parsed.data).where(and(eq(accountStaff.id, id), eq(accountStaff.customerId, customer.id)));
  } else {
    await db.insert(accountStaff).values({ ...parsed.data, customerId: customer.id, createdBy: me.id });
  }
  await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: id ? "updated" : "created", summary: `${me.name} ${id ? "updated" : "added"} staff ${parsed.data.name} at ${customer.name}` });
  refresh(customer.id);
  return { ok: true, savedAt: Date.now(), message: id ? "Saved." : `${parsed.data.name} added.` };
}

export async function archiveStaff(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const row = isUuid(id) ? await db.query.accountStaff.findFirst({ where: eq(accountStaff.id, id) }) : undefined;
  if (!row) return { message: "That person is no longer on the list." };
  await db.update(accountStaff).set({ deletedAt: new Date() }).where(eq(accountStaff.id, id));
  await logActivity({ actor: me, entityType: "customer", entityId: row.customerId, action: "status_changed", summary: `${me.name} archived staff ${row.name}` });
  refresh(row.customerId);
  return { ok: true, savedAt: Date.now(), message: `${row.name} archived. Orders keep their name.` };
}

const staffRow = z.object({
  name: z.string().trim().min(2, "Enter their name."),
  branch: z.string().trim().optional().default(""),
  role: z.string().trim().optional().default(""),
  sizes: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

export async function importStaff(customerId: string, rows: unknown[]): Promise<Result> {
  const me = await requireOwner();
  const customer = await customerOf(customerId);
  if (!customer) return { error: "That customer no longer exists." };
  const parsed = z.array(staffRow).max(2000).safeParse(rows);
  if (!parsed.success) return { error: "Some rows could not be read. Check the names." };
  const [branches, existing] = await Promise.all([
    db.select().from(customerBranches).where(and(eq(customerBranches.customerId, customer.id), isNull(customerBranches.deletedAt))),
    db.select().from(accountStaff).where(and(eq(accountStaff.customerId, customer.id), isNull(accountStaff.deletedAt))),
  ]);
  let added = 0;
  let updated = 0;
  for (const r of parsed.data) {
    const branchId = r.branch ? (branches.find((b) => b.name.trim().toLowerCase() === r.branch.toLowerCase())?.id ?? null) : null;
    const values = { name: r.name, branchId, role: r.role || null, sizes: r.sizes || null, notes: r.notes || null };
    const match = existing.find((s) => s.name.trim().toLowerCase() === r.name.toLowerCase() && (s.branchId ?? null) === branchId);
    if (match) {
      const patch = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
      await db.update(accountStaff).set(patch).where(eq(accountStaff.id, match.id));
      updated++;
    } else {
      await db.insert(accountStaff).values({ ...values, customerId: customer.id, createdBy: me.id });
      added++;
    }
  }
  await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: "updated", summary: `${me.name} imported staff for ${customer.name}: ${added} added, ${updated} updated` });
  refresh(customer.id);
  return { ok: true, count: added + updated, message: `${added} added, ${updated} updated.` };
}

/* ---------- Catalogue ---------- */

const itemSchema = z.object({
  name: requiredName("Enter the item, for example Lounge tunic."),
  price: moneySchema.refine((v) => v > 0, "Enter the agreed price."),
  notes: optionalText,
});

export async function saveAccountItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const customer = await customerOf(text(fd, "customerId"));
  if (!customer) return { message: "That customer no longer exists." };
  const id = text(fd, "id");
  const parsed = itemSchema.safeParse({ name: text(fd, "name"), price: text(fd, "price"), notes: text(fd, "notes") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { name, price, notes } = parsed.data;
  // Free typed rule: the item links to a product, made silently when new.
  const product = await resolveProduct({ description: name, unitPriceFils: price }, me.id, new Map());
  if (isUuid(id)) {
    await db.update(accountItems).set({ name, agreedPriceFils: price, notes, productId: product.id }).where(and(eq(accountItems.id, id), eq(accountItems.customerId, customer.id)));
  } else {
    const [{ top }] = await db.select({ top: sql<number>`coalesce(max(${accountItems.sortOrder}), 0)::int` }).from(accountItems).where(eq(accountItems.customerId, customer.id));
    await db.insert(accountItems).values({ customerId: customer.id, name, agreedPriceFils: price, notes, productId: product.id, sortOrder: top + 10, createdBy: me.id });
  }
  await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: id ? "updated" : "created", summary: `${me.name} set ${customer.name}'s price for ${name} at ${formatFils(price)}` });
  refresh(customer.id);
  return { ok: true, savedAt: Date.now(), message: id ? "Price saved." : `${name} added to the catalogue.` };
}

export async function archiveAccountItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const row = isUuid(id) ? await db.query.accountItems.findFirst({ where: eq(accountItems.id, id) }) : undefined;
  if (!row) return { message: "That item is no longer in the catalogue." };
  await db.update(accountItems).set({ deletedAt: new Date() }).where(eq(accountItems.id, id));
  await logActivity({ actor: me, entityType: "customer", entityId: row.customerId, action: "status_changed", summary: `${me.name} removed ${row.name} from the catalogue` });
  refresh(row.customerId);
  return { ok: true, savedAt: Date.now(), message: `${row.name} removed. Orders keep their price.` };
}

/* ---------- Delivery runs ---------- */

const runSchema = z.object({
  customerId: z.string().refine(isUuid),
  date: isoDate,
  emirate: z.string().trim().optional().default(""),
  deliverySupplierId: z.string().optional().transform((v) => (isUuid(v) ? v : null)),
  notes: z.string().trim().max(1000).optional().default(""),
  orderIds: z.array(z.string().refine(isUuid)).min(1, "Pick at least one order."),
});

/**
 * A trip to one emirate. Everything still to go to the branches there becomes one pending
 * delivery note per branch and order, ready to print for the driver.
 */
export async function createDeliveryRun(input: z.input<typeof runSchema>): Promise<Result & { runId?: string }> {
  const me = await requireOwner();
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the run." };
  const r = parsed.data;
  const customer = await customerOf(r.customerId);
  if (!customer) return { error: "That customer no longer exists." };
  const orders = await db
    .select()
    .from(salesOrders)
    .where(and(inArray(salesOrders.id, r.orderIds), eq(salesOrders.customerId, customer.id), ne(salesOrders.stage, "draft"), ne(salesOrders.stage, "cancelled")));
  if (!orders.length) return { error: "Those orders cannot be delivered." };
  if (r.deliverySupplierId) {
    const s = await db.query.suppliers.findFirst({ where: and(eq(suppliers.id, r.deliverySupplierId), eq(suppliers.type, "delivery")) });
    if (!s) return { error: "Pick a delivery company from your suppliers." };
  }
  const branches = await db.select().from(customerBranches).where(eq(customerBranches.customerId, customer.id));
  const inEmirate = (branchId: string | null) => !r.emirate || branches.find((b) => b.id === branchId)?.emirate === r.emirate;
  const pending = (await pendingByBranch(orders.map((o) => o.id))).filter((p) => p.branchId && inEmirate(p.branchId));
  if (!pending.length) return { error: r.emirate ? `Nothing is waiting to go to branches in ${r.emirate}.` : "Nothing is waiting to go to a branch." };

  const runId = randomUUID();
  const groups = new Map<string, typeof pending>();
  for (const p of pending) {
    const k = `${p.orderId}|${p.branchId}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const batch: BatchItem<"pg">[] = [
    db.insert(deliveryRuns).values({ id: runId, customerId: customer.id, runDate: r.date ?? todayISO(), emirate: r.emirate || null, deliverySupplierId: r.deliverySupplierId, notes: r.notes || null, createdBy: me.id }),
  ];
  for (const [k, rows] of groups) {
    const [orderId, branchId] = k.split("|");
    const order = orders.find((o) => o.id === orderId)!;
    const id = randomUUID();
    batch.push(
      db.insert(deliveryNotes).values({
        id,
        number: await nextDocumentNumber("delivery_note"),
        orderId,
        customerId: customer.id,
        branchId,
        deliveryDate: r.date ?? todayISO(),
        customerPoNumber: order.customerPoNumber,
        runId,
        status: "pending",
        createdBy: me.id,
      }),
      db.insert(deliveryNoteLines).values(rows.map((p) => ({ deliveryNoteId: id, soLineId: p.soLineId, allocationId: p.allocationId, description: p.description, qty: p.left, createdBy: me.id }))),
    );
  }
  await db.batch(batch as Batch);
  await logActivity({ actor: me, entityType: "customer", entityId: customer.id, action: "created", summary: `${me.name} planned a delivery run${r.emirate ? ` to ${r.emirate}` : ""} for ${customer.name}: ${groups.size} delivery ${groups.size === 1 ? "note" : "notes"}` });
  refresh(customer.id);
  for (const o of orders) revalidatePath(`/orders/${o.id}`);
  return { ok: true, runId, count: groups.size };
}

/** Marks one branch delivered. Pieces left unticked are ticked now. */
export async function markDelivered(input: { deliveryNoteId: string; receivedBy: string; date?: string }): Promise<Result> {
  const me = await requireOwner();
  const dn = isUuid(input.deliveryNoteId) ? await db.query.deliveryNotes.findFirst({ where: eq(deliveryNotes.id, input.deliveryNoteId) }) : undefined;
  if (!dn) return { error: "That delivery note no longer exists." };
  if (dn.status === "delivered") return { ok: true };
  const receivedBy = input.receivedBy.trim().slice(0, 120);
  if (!receivedBy) return { error: "Who received it? A name is enough." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? input.date! : todayISO();
  const { pieces, ticked } = await deliveryNotePieces(dn.id);
  const untick = pieces.filter((p) => !ticked.has(p.key));
  await db.update(deliveryNotes).set({ status: "delivered", deliveredAt: new Date(), receivedBy, deliveryDate: date }).where(eq(deliveryNotes.id, dn.id));
  if (untick.length) {
    await db.insert(pieceTicks).values(untick.map((p) => ({ orderId: dn.orderId, pieceKey: p.key, deliveryNoteId: dn.id, createdBy: me.id }))).onConflictDoNothing();
  }
  await refreshOrderStage(dn.orderId);
  await logActivity({ actor: me, entityType: "sales_order", entityId: dn.orderId, action: "status_changed", summary: `${me.name} marked ${dn.number} delivered, received by ${receivedBy}` });
  await notify("owners", { kind: "delivered", title: `Delivered: ${dn.number}`, body: `Received by ${receivedBy}.`, href: `/orders/${dn.orderId}` }, me.id);
  refresh(dn.customerId);
  revalidatePath(`/orders/${dn.orderId}`);
  revalidatePath("/orders");
  return { ok: true };
}

/** Takes a pending note off the run. Its number is not reused. */
export async function removePendingDeliveryNote(deliveryNoteId: string): Promise<Result> {
  const me = await requireOwner();
  const dn = isUuid(deliveryNoteId) ? await db.query.deliveryNotes.findFirst({ where: eq(deliveryNotes.id, deliveryNoteId) }) : undefined;
  if (!dn) return { error: "That delivery note no longer exists." };
  if (dn.status !== "pending") return { error: "A delivered note stays on record." };
  await db.batch([db.delete(pieceTicks).where(eq(pieceTicks.deliveryNoteId, dn.id)), db.delete(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, dn.id)), db.delete(deliveryNotes).where(eq(deliveryNotes.id, dn.id))]);
  if (dn.runId) {
    const [{ left }] = await db.select({ left: sql<number>`count(*)::int` }).from(deliveryNotes).where(eq(deliveryNotes.runId, dn.runId));
    if (!left) await db.delete(deliveryRuns).where(eq(deliveryRuns.id, dn.runId));
  }
  await logActivity({ actor: me, entityType: "sales_order", entityId: dn.orderId, action: "status_changed", summary: `${me.name} took ${dn.number} off the delivery run` });
  refresh(dn.customerId);
  revalidatePath(`/orders/${dn.orderId}`);
  return { ok: true };
}

/** Garment labels ticked off one by one at the branch. */
export async function tickPiece(input: { deliveryNoteId: string; pieceKey: string; on: boolean }): Promise<Result> {
  const me = await requireOwner();
  const dn = isUuid(input.deliveryNoteId) ? await db.query.deliveryNotes.findFirst({ where: eq(deliveryNotes.id, input.deliveryNoteId) }) : undefined;
  if (!dn) return { error: "That delivery note no longer exists." };
  const { pieces } = await deliveryNotePieces(dn.id);
  if (!pieces.some((p) => p.key === input.pieceKey)) return { error: "That piece is not on this note." };
  if (input.on) {
    await db.insert(pieceTicks).values({ orderId: dn.orderId, pieceKey: input.pieceKey, deliveryNoteId: dn.id, createdBy: me.id }).onConflictDoNothing();
  } else {
    await db.delete(pieceTicks).where(and(eq(pieceTicks.orderId, dn.orderId), eq(pieceTicks.pieceKey, input.pieceKey)));
  }
  return { ok: true };
}

/** Pieces on one delivery note, for the tick list. Loaded when the dialog opens. */
export async function deliveryPieces(deliveryNoteId: string) {
  await requireOwner();
  if (!isUuid(deliveryNoteId)) return { pieces: [], ticked: [] as string[] };
  const { pieces, ticked } = await deliveryNotePieces(deliveryNoteId);
  return { pieces, ticked: [...ticked] };
}
