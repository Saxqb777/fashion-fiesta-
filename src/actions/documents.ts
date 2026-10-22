"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  accountItems,
  accountStaff,
  customerBranches,
  customerMeasurements,
  customers,
  deliveryNoteLines,
  soLineAllocations,
  quoteLines,
  quotes,
  salesOrders,
  soLines,
  suppliers,
  tasks,
  users,
} from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { customerSeasons } from "@/lib/accounts";
import { agingByCustomer } from "@/lib/ledger";
import { syncOutsourcingPOs } from "@/lib/outsourcing";
import { parseCenti } from "@/lib/qty";
import { likeTerm } from "@/lib/archive";
import { todayISO } from "@/lib/dates";
import { moneySchema, optionalText, text, type FormState } from "@/lib/forms";
import { documentTotals, lineAmounts } from "@/lib/lines";
import { nextDocumentNumber } from "@/lib/numbering";
import { flashDone } from "@/lib/flash";
import { refreshOrderStage } from "@/lib/order-stage";
import { isoDate, issuesToErrors, uuidOrNull } from "@/lib/payload";
import { resolveProduct } from "@/lib/products-auto";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { taskLocked } from "@/lib/stages";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

/* ---------- Customer lookups for the editor ---------- */

export type CustomerOption = { id: string; name: string; tier: "vip" | "regular" | "new"; type: "retail" | "wholesale"; phone: string | null };

export async function searchCustomers(q: string): Promise<CustomerOption[]> {
  await requireOwner();
  const term = q.trim();
  return db
    .select({ id: customers.id, name: customers.name, tier: customers.tier, type: customers.type, phone: customers.phone })
    .from(customers)
    .where(and(isNull(customers.deletedAt), term ? or(ilike(customers.name, likeTerm(term)), ilike(customers.phone, likeTerm(term))) : undefined))
    .orderBy(sql`case ${customers.tier} when 'vip' then 0 when 'regular' then 1 else 2 end`, asc(customers.name))
    .limit(8);
}

export type CustomerContext = {
  customer: CustomerOption;
  branches: { id: string; name: string }[];
  measurements: { id: string; label: string; values: { name: string; value: string }[]; createdAt: string; templateId: string | null; templateName: string | null }[];
  lastPrices: Record<string, number>;
  /** For the credit warning on new orders. Warn, never block. */
  money: { owedFils: number; overdueFils: number; oldestDue: string | null; creditLimitFils: number | null };
  /** Key accounts only: agreed prices, staff with sizes and seasons used before. */
  account: {
    items: { productId: string | null; name: string; agreedPriceFils: number }[];
    staff: { id: string; name: string; branchId: string | null; sizes: string | null }[];
    seasons: string[];
  } | null;
};

export async function getCustomerContext(customerId: string): Promise<CustomerContext | null> {
  await requireOwner();
  if (!/^[0-9a-f-]{36}$/.test(customerId)) return null;
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!customer) return null;
  const [branches, measurements, prices, [aging]] = await Promise.all([
    db
      .select({ id: customerBranches.id, name: customerBranches.name })
      .from(customerBranches)
      .where(and(eq(customerBranches.customerId, customerId), isNull(customerBranches.deletedAt)))
      .orderBy(asc(customerBranches.name)),
    db
      .select()
      .from(customerMeasurements)
      .where(and(eq(customerMeasurements.customerId, customerId), isNull(customerMeasurements.deletedAt)))
      .orderBy(asc(customerMeasurements.label)),
    db.execute<{ product_id: string; unit_price_fils: number }>(sql`
      select distinct on (product_id) product_id, unit_price_fils from (
        select l.product_id, l.unit_price_fils, o.created_at from so_lines l join sales_orders o on o.id = l.order_id
          where o.customer_id = ${customerId} and l.product_id is not null
        union all
        select l.product_id, l.unit_price_fils, q.created_at from quote_lines l join quotes q on q.id = l.quote_id
          where q.customer_id = ${customerId} and l.product_id is not null
      ) x order by product_id, created_at desc`),
    agingByCustomer(customerId),
  ]);
  const account = customer.isKeyAccount
    ? await Promise.all([
        db
          .select({ productId: accountItems.productId, name: accountItems.name, agreedPriceFils: accountItems.agreedPriceFils })
          .from(accountItems)
          .where(and(eq(accountItems.customerId, customerId), isNull(accountItems.deletedAt)))
          .orderBy(asc(accountItems.sortOrder)),
        db
          .select({ id: accountStaff.id, name: accountStaff.name, branchId: accountStaff.branchId, sizes: accountStaff.sizes })
          .from(accountStaff)
          .where(and(eq(accountStaff.customerId, customerId), isNull(accountStaff.deletedAt)))
          .orderBy(asc(accountStaff.name)),
        customerSeasons(customerId),
      ]).then(([items, staff, seasons]) => ({ items, staff, seasons }))
    : null;
  return {
    customer: { id: customer.id, name: customer.name, tier: customer.tier, type: customer.type, phone: customer.phone },
    branches,
    measurements: measurements.map((m) => ({ id: m.id, label: m.label, values: m.values, createdAt: m.createdAt.toISOString(), templateId: m.templateId, templateName: m.templateName })),
    lastPrices: Object.fromEntries(prices.rows.map((r) => [r.product_id, Number(r.unit_price_fils)])),
    money: {
      owedFils: aging?.owed ?? 0,
      overdueFils: aging ? aging.d1_30 + aging.d31_60 + aging.d61 : 0,
      oldestDue: aging?.oldestDue ?? null,
      creditLimitFils: customer.creditLimitFils,
    },
    account,
  };
}

export async function quickAddCustomer(input: { name: string; phone: string; type: "retail" | "wholesale" }): Promise<{ id?: string; error?: string }> {
  const me = await requireOwner();
  const name = input.name.trim();
  if (name.length < 2) return { error: "Enter the customer name." };
  const [row] = await db
    .insert(customers)
    .values({ name, phone: input.phone.trim() || null, type: input.type === "wholesale" ? "wholesale" : "retail", createdBy: me.id })
    .returning({ id: customers.id });
  await logActivity({ actor: me, entityType: "customer", entityId: row.id, action: "created", summary: `${me.name} added customer ${name} while making an order` });
  revalidatePath("/customers");
  return { id: row.id };
}

/* ---------- Payload ---------- */

const assignmentSchema = z.object({
  taskId: uuidOrNull,
  type: z.enum(["tailor", "unit"]),
  assigneeId: z.string().regex(/^[0-9a-f-]{36}$/, "Pick who does this."),
  qty: z.number().int().min(1, "At least 1."),
});

const lineSchema = z.object({
  id: uuidOrNull,
  productId: uuidOrNull,
  description: z.string().trim().min(1, "Type what this line is."),
  qty: z.number({ message: "Enter a quantity." }).int("Whole pieces only.").min(1, "At least 1.").max(100000),
  unitPrice: moneySchema,
  notes: optionalText,
  dueDate: isoDate.optional().default(""),
  fabricId: uuidOrNull,
  /** Fabric per piece in metres, like "2.5". Empty means not set. */
  metresPerPiece: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || String(v).trim() === "") return null;
      const c = parseCenti(v);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: "Metres like 2.5 or 2.50." });
        return z.NEVER;
      }
      return c;
    }),
  measurementId: uuidOrNull,
  assignments: z.array(assignmentSchema).default([]),
  /** Optional split per branch and person. When present, the parts add up to the line quantity. */
  allocations: z
    .array(
      z.object({
        id: uuidOrNull,
        branchId: uuidOrNull,
        staffId: uuidOrNull,
        personName: z.string().trim().max(120).optional().default(""),
        size: z.string().trim().max(60).optional().default(""),
        qty: z.number().int("Whole pieces only.").min(1, "At least 1."),
      }),
    )
    .default([]),
});

const docSchema = z.object({
  id: uuidOrNull,
  customerId: z.string().regex(/^[0-9a-f-]{36}$/, "Pick a customer."),
  branchId: uuidOrNull,
  date: isoDate,
  dueDate: isoDate.optional().default(""),
  validUntil: isoDate.optional().default(""),
  notes: optionalText,
  customerPoNumber: z
    .string()
    .trim()
    .max(60, "Keep the Customer PO number under 60 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
  sourceQuoteId: uuidOrNull,
  season: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v : null)),
  /** Only files this app stored from Read their document. */
  customerPoFileUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/documents\//i.test(v) ? v : null)),
  customerPoFileName: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  lines: z.array(lineSchema).min(1, "Add at least one line."),
});

type Doc = z.infer<typeof docSchema>;

function parsePayload(fd: FormData) {
  try {
    return docSchema.safeParse(JSON.parse(String(fd.get("payload") ?? "{}")));
  } catch {
    return docSchema.safeParse({});
  }
}

async function checkCustomer(doc: Doc) {
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, doc.customerId) });
  if (!customer) return { error: "That customer no longer exists." };
  if (doc.branchId) {
    const branch = await db.query.customerBranches.findFirst({
      where: and(eq(customerBranches.id, doc.branchId), eq(customerBranches.customerId, customer.id)),
    });
    if (!branch) return { error: "That branch does not belong to this customer." };
  }
  return { customer };
}

/* ---------- Quotes ---------- */

type Owner = Awaited<ReturnType<typeof requireOwner>>;
type Persisted = { ok: true; id: string; outcome: "draft" | "confirmed" | "updated" | "created" } | { ok?: false; message?: string; errors?: Record<string, string[] | undefined> };

export async function saveQuote(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = parsePayload(fd);
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const res = await persistQuote(parsed.data, me);
  if (!res.ok) return res;
  redirect(`/orders/quotes/${res.id}?${res.outcome === "updated" ? "saved" : "added"}=1`);
}

async function persistQuote(doc: Doc, me: Owner): Promise<Persisted> {
  const { customer, error } = await checkCustomer(doc);
  if (!customer) return { message: error };

  const existing = doc.id ? await db.query.quotes.findFirst({ where: eq(quotes.id, doc.id) }) : undefined;
  if (doc.id && !existing) return { message: "That quote no longer exists." };
  if (existing?.status === "accepted") return { message: "This quote is already an order. Edit the order instead." };

  const settings = await getSettings();
  const cache = new Map<string, string>();
  const lines = [];
  for (const [i, l] of doc.lines.entries()) {
    const product = await resolveProduct({ productId: l.productId, description: l.description, unitPriceFils: l.unitPrice }, me.id, cache);
    lines.push({ ...l, sort: i, productId: product.id, ...lineAmounts(l.qty, l.unitPrice, settings.vatRateBp) });
  }
  const totals = documentTotals(lines);
  const quoteId = existing?.id ?? randomUUID();
  const number = existing?.number ?? (await nextDocumentNumber("quote"));
  const header = {
    customerId: customer.id,
    branchId: doc.branchId,
    quoteDate: doc.date ?? todayISO(),
    validUntil: doc.validUntil,
    notes: doc.notes,
    customerPoFileUrl: doc.customerPoFileUrl,
    customerPoFileName: doc.customerPoFileUrl ? doc.customerPoFileName : null,
    ...totals,
  };
  const lineRows = lines.map((l) => ({
    quoteId,
    sort: l.sort,
    productId: l.productId,
    description: l.description,
    qty: l.qty,
    unitPriceFils: l.unitPrice,
    vatRateBp: settings.vatRateBp,
    netFils: l.netFils,
    vatFils: l.vatFils,
    notes: l.notes,
    createdBy: me.id,
  }));

  const batch: BatchItem<"pg">[] = existing
    ? [db.update(quotes).set(header).where(eq(quotes.id, quoteId)), db.delete(quoteLines).where(eq(quoteLines.quoteId, quoteId))]
    : [db.insert(quotes).values({ id: quoteId, number, ...header, createdBy: me.id })];
  batch.push(db.insert(quoteLines).values(lineRows));
  await db.batch(batch as Batch);

  await logActivity({
    actor: me,
    entityType: "quote",
    entityId: quoteId,
    action: existing ? "updated" : "created",
    summary: `${me.name} ${existing ? "updated" : "made"} quote ${number} for ${customer.name}`,
  });
  revalidatePath("/orders/quotes");
  revalidatePath(`/customers/${customer.id}`);
  return { ok: true, id: quoteId, outcome: existing ? "updated" : "created" };
}

export async function setQuoteStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const status = z.enum(["draft", "sent", "declined"]).safeParse(text(fd, "status"));
  if (!status.success) return { message: "Unknown status." };
  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!quote) return { message: "That quote no longer exists." };
  if (quote.status === "accepted") return { message: "This quote is already an order." };
  await db.update(quotes).set({ status: status.data }).where(eq(quotes.id, id));
  await logActivity({ actor: me, entityType: "quote", entityId: id, action: "status_changed", summary: `${me.name} marked quote ${quote.number} as ${status.data}` });
  revalidatePath(`/orders/quotes/${id}`);
  revalidatePath("/orders/quotes");
  return flashDone(status.data === "sent" ? "Marked as sent." : status.data === "declined" ? "Marked as declined." : "Back to draft.");
}

/* ---------- Orders ---------- */

export async function saveOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = parsePayload(fd);
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const res = await persistOrder(parsed.data, text(fd, "intent") === "draft" ? "draft" : "confirm", me);
  if (!res.ok) return res;
  redirect(`/orders/${res.id}?${res.outcome === "draft" ? "draft" : res.outcome === "confirmed" ? "added" : "saved"}=1`);
}

async function persistOrder(doc: Doc, intent: "draft" | "confirm", me: Owner): Promise<Persisted> {
  const { customer, error } = await checkCustomer(doc);
  if (!customer) return { message: error };

  const existing = doc.id ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, doc.id) }) : undefined;
  if (doc.id && !existing) return { message: "That order no longer exists." };
  if (existing && !["draft", "confirmed", "stitching", "ready"].includes(existing.stage)) {
    return { message: "Delivered orders cannot be changed." };
  }
  // Drafts: no number, no tasks, not in reports. Confirm order turns a draft (or a new order) into a real one.
  const wasDraft = !existing || existing.stage === "draft";
  const savingDraft = wasDraft && intent === "draft";
  const confirming = wasDraft && !savingDraft;

  const errors: Record<string, string[]> = {};

  // Who can be assigned.
  const assigneeIds = doc.lines.flatMap((l) => l.assignments.map((a) => a.assigneeId));
  const [tailorRows, unitRows] = assigneeIds.length
    ? await Promise.all([
        db.select({ id: users.id }).from(users).where(and(inArray(users.id, assigneeIds), eq(users.isActive, true), isNull(users.deletedAt))),
        db.select({ id: suppliers.id }).from(suppliers).where(and(inArray(suppliers.id, assigneeIds), eq(suppliers.type, "outsourcing"), isNull(suppliers.deletedAt))),
      ])
    : [[], []];
  const tailorSet = new Set(tailorRows.map((r) => r.id));
  const unitSet = new Set(unitRows.map((r) => r.id));

  // Existing lines and tasks, for edits.
  const oldLines = existing ? await db.select().from(soLines).where(eq(soLines.orderId, existing.id)) : [];
  const oldTasks = existing ? await db.select().from(tasks).where(eq(tasks.orderId, existing.id)) : [];
  const oldLineById = new Map(oldLines.map((l) => [l.id, l]));
  const oldTaskById = new Map(oldTasks.map((t) => [t.id, t]));
  const keptLineIds = new Set(doc.lines.map((l) => l.id).filter(Boolean) as string[]);
  const keptTaskIds = new Set(doc.lines.flatMap((l) => l.assignments.map((a) => a.taskId)).filter(Boolean) as string[]);

  doc.lines.forEach((l, i) => {
    if (l.id && !oldLineById.has(l.id)) errors[`lines.${i}.description`] = ["This line was removed elsewhere. Reload the page."];
    const assigned = l.assignments.reduce((s, a) => s + a.qty, 0);
    if (assigned > l.qty) errors[`lines.${i}.assignments`] = [`${assigned} assigned but the line has ${l.qty}.`];
    l.assignments.forEach((a, j) => {
      const ok = a.type === "tailor" ? tailorSet.has(a.assigneeId) : unitSet.has(a.assigneeId);
      if (!ok) errors[`lines.${i}.assignments.${j}`] = ["That person or unit is no longer available."];
      const old = a.taskId ? oldTaskById.get(a.taskId) : undefined;
      if (a.taskId && !old) errors[`lines.${i}.assignments.${j}`] = ["This task changed elsewhere. Reload the page."];
      if (old && taskLocked(old) && (old.qty !== a.qty || (old.tailorId ?? old.supplierId) !== a.assigneeId)) {
        errors[`lines.${i}.assignments.${j}`] = ["Work has started on this task, so it cannot be changed here."];
      }
    });
  });
  for (const t of oldTasks) {
    if (!keptTaskIds.has(t.id) && taskLocked(t)) {
      const lineIndex = doc.lines.findIndex((l) => l.id === t.soLineId);
      errors[lineIndex >= 0 ? `lines.${lineIndex}.assignments` : "_"] = ["Work has started on a removed task. Keep it, or finish it in the Workshop."];
    }
  }
  for (const l of oldLines) {
    if (!keptLineIds.has(l.id) && oldTasks.some((t) => t.soLineId === l.id && taskLocked(t))) {
      errors["_"] = [`"${l.description}" has work in progress, so it cannot be removed.`];
    }
  }

  // Splits per branch and person. Optional; when used, the parts add up to the line.
  const allocBranchIds = [...new Set(doc.lines.flatMap((l) => l.allocations.map((a) => a.branchId)).filter(Boolean) as string[])];
  const allocStaffIds = [...new Set(doc.lines.flatMap((l) => l.allocations.map((a) => a.staffId)).filter(Boolean) as string[])];
  const [okBranches, okStaff, oldAllocs, onNotes] = await Promise.all([
    allocBranchIds.length
      ? db.select({ id: customerBranches.id }).from(customerBranches).where(and(inArray(customerBranches.id, allocBranchIds), eq(customerBranches.customerId, customer.id)))
      : [],
    allocStaffIds.length ? db.select({ id: accountStaff.id }).from(accountStaff).where(and(inArray(accountStaff.id, allocStaffIds), eq(accountStaff.customerId, customer.id))) : [],
    oldLines.length ? db.select().from(soLineAllocations).where(inArray(soLineAllocations.soLineId, oldLines.map((l) => l.id))) : [],
    oldLines.length
      ? db
          .select({ soLineId: deliveryNoteLines.soLineId, allocationId: deliveryNoteLines.allocationId, n: sql<number>`sum(${deliveryNoteLines.qty})::int` })
          .from(deliveryNoteLines)
          .where(inArray(deliveryNoteLines.soLineId, oldLines.map((l) => l.id)))
          .groupBy(deliveryNoteLines.soLineId, deliveryNoteLines.allocationId)
      : [],
  ]);
  const branchOk = new Set(okBranches.map((b) => b.id));
  const staffOk = new Set(okStaff.map((b) => b.id));
  const oldAllocById = new Map(oldAllocs.map((a) => [a.id, a]));
  const keptAllocIds = new Set(doc.lines.flatMap((l) => l.allocations.map((a) => a.id)).filter(Boolean) as string[]);
  doc.lines.forEach((l, i) => {
    if (!l.allocations.length) return;
    const sum = l.allocations.reduce((s, a) => s + a.qty, 0);
    if (sum !== l.qty) errors[`lines.${i}.allocations`] = [`The parts add up to ${sum}. The line has ${l.qty}.`];
    for (const a of l.allocations) {
      if (a.branchId && !branchOk.has(a.branchId)) errors[`lines.${i}.allocations`] = ["A branch is no longer on this customer."];
      if (a.staffId && !staffOk.has(a.staffId)) errors[`lines.${i}.allocations`] = ["A person is no longer on their staff list."];
      if (a.id && oldAllocById.get(a.id)?.soLineId !== l.id) errors[`lines.${i}.allocations`] = ["This split changed elsewhere. Reload the page."];
      const sent = a.id ? (onNotes.find((n) => n.allocationId === a.id)?.n ?? 0) : 0;
      if (sent > a.qty) errors[`lines.${i}.allocations`] = [`${sent} pieces of one part are already on a delivery note.`];
      if (a.id && sent && oldAllocById.get(a.id)?.branchId !== a.branchId) errors[`lines.${i}.allocations`] = ["A part already on a delivery note keeps its branch."];
    }
  });
  for (const a of oldAllocs) {
    if (keptAllocIds.has(a.id) || !onNotes.some((n) => n.allocationId === a.id)) continue;
    const lineIndex = doc.lines.findIndex((l) => l.id === a.soLineId);
    errors[lineIndex >= 0 ? `lines.${lineIndex}.allocations` : "_"] = ["A part already on a delivery note cannot be removed."];
  }
  for (const l of oldLines) {
    if (!keptLineIds.has(l.id) && onNotes.some((n) => n.soLineId === l.id)) errors["_"] = [`"${l.description}" is on a delivery note, so it cannot be removed.`];
  }
  if (Object.keys(errors).length) return { message: errors["_"]?.[0] ?? "Check the highlighted lines.", errors };

  // Measurements: copy the chosen set into the line. Unchanged choices keep their frozen copy.
  const measurementIds = doc.lines.map((l) => l.measurementId).filter(Boolean) as string[];
  const sets = measurementIds.length
    ? await db.select().from(customerMeasurements).where(and(inArray(customerMeasurements.id, measurementIds), eq(customerMeasurements.customerId, customer.id)))
    : [];
  const setById = new Map(sets.map((s) => [s.id, s]));

  const settings = await getSettings();
  const cache = new Map<string, string>();
  const orderId = existing?.id ?? randomUUID();
  const number = existing?.number ?? (savingDraft ? null : await nextDocumentNumber("sales_order"));
  const quoteId = doc.sourceQuoteId ?? existing?.quoteId ?? null;
  const orderDue = doc.dueDate;

  const lineRows = [];
  const taskInserts = [];
  const taskUpdates: { id: string; values: Partial<typeof tasks.$inferInsert> }[] = [];
  for (const [i, l] of doc.lines.entries()) {
    const product = await resolveProduct({ productId: l.productId, description: l.description, unitPriceFils: l.unitPrice }, me.id, cache);
    const lineId = l.id ?? randomUUID();
    const old = l.id ? oldLineById.get(l.id) : undefined;
    const set = l.measurementId ? setById.get(l.measurementId) : undefined;
    const keepSnapshot = old && old.measurementId === l.measurementId;
    lineRows.push({
      id: lineId,
      isNew: !old,
      values: {
        orderId,
        sort: i,
        productId: product.id,
        description: l.description,
        qty: l.qty,
        unitPriceFils: l.unitPrice,
        vatRateBp: settings.vatRateBp,
        ...lineAmounts(l.qty, l.unitPrice, settings.vatRateBp),
        dueDate: l.dueDate,
        fabricId: l.fabricId,
        metresPerPieceCenti: l.metresPerPiece,
        measurementId: l.measurementId && (set || keepSnapshot) ? l.measurementId : null,
        measurementLabel: keepSnapshot ? old.measurementLabel : (set?.label ?? null),
        measurements: keepSnapshot ? old.measurements : (set?.values ?? null),
        notes: l.notes,
        draftAssignments: savingDraft ? l.assignments.map((a) => ({ type: a.type, assigneeId: a.assigneeId, qty: a.qty })) : null,
      },
    });
    const taskDue = l.dueDate ?? orderDue;
    if (savingDraft) continue;
    for (const a of l.assignments) {
      const assignee = a.type === "tailor" ? { tailorId: a.assigneeId, supplierId: null } : { tailorId: null, supplierId: a.assigneeId };
      const oldTask = a.taskId ? oldTaskById.get(a.taskId) : undefined;
      if (oldTask) {
        if (taskLocked(oldTask)) {
          taskUpdates.push({ id: oldTask.id, values: { dueDate: taskDue } });
        } else {
          const moved = (oldTask.tailorId ?? oldTask.supplierId) !== a.assigneeId;
          taskUpdates.push({
            id: oldTask.id,
            values: { assigneeType: a.type, ...assignee, qty: a.qty, dueDate: taskDue, ...(moved ? { status: "assigned" as const, openQuestion: false } : {}) },
          });
        }
      } else {
        taskInserts.push({ id: randomUUID(), orderId, soLineId: lineId, assigneeType: a.type, ...assignee, qty: a.qty, dueDate: taskDue, createdBy: me.id });
      }
    }
  }
  const totals = documentTotals(lineRows.map((l) => l.values));
  const header = {
    customerId: customer.id,
    branchId: doc.branchId,
    orderDate: doc.date ?? todayISO(),
    dueDate: orderDue,
    notes: doc.notes,
    season: doc.season,
    customerPoNumber: doc.customerPoNumber,
    customerPoFileUrl: doc.customerPoFileUrl,
    customerPoFileName: doc.customerPoFileUrl ? doc.customerPoFileName : null,
    ...totals,
    ...(wasDraft ? { number, quoteId, stage: savingDraft ? ("draft" as const) : ("confirmed" as const) } : {}),
  };

  const batch: BatchItem<"pg">[] = [];
  if (existing) {
    batch.push(db.update(salesOrders).set(header).where(eq(salesOrders.id, orderId)));
    const removedTasks = oldTasks.filter((t) => !keptTaskIds.has(t.id)).map((t) => t.id);
    if (removedTasks.length) batch.push(db.delete(tasks).where(inArray(tasks.id, removedTasks)));
    const removedLines = oldLines.filter((l) => !keptLineIds.has(l.id)).map((l) => l.id);
    if (removedLines.length) batch.push(db.delete(soLines).where(inArray(soLines.id, removedLines)));
  } else {
    batch.push(db.insert(salesOrders).values({ id: orderId, ...header, createdBy: me.id }));
  }
  for (const l of lineRows) {
    batch.push(l.isNew ? db.insert(soLines).values({ id: l.id, ...l.values, createdBy: me.id }) : db.update(soLines).set(l.values).where(eq(soLines.id, l.id)));
  }
  const lineIds: string[] = lineRows.map((l) => l.id);
  const removedAllocs = oldAllocs.filter((a) => keptLineIds.has(a.soLineId) && !keptAllocIds.has(a.id)).map((a) => a.id);
  if (removedAllocs.length) batch.push(db.delete(soLineAllocations).where(inArray(soLineAllocations.id, removedAllocs)));
  doc.lines.forEach((l, i) => {
    l.allocations.forEach((a, j) => {
      const values = { branchId: a.branchId, staffId: a.staffId, personName: a.personName || null, size: a.size || null, qty: a.qty, sort: j };
      if (a.id) batch.push(db.update(soLineAllocations).set(values).where(eq(soLineAllocations.id, a.id)));
      else batch.push(db.insert(soLineAllocations).values({ ...values, soLineId: lineIds[i], createdBy: me.id }));
    });
  });
  for (const t of taskUpdates) batch.push(db.update(tasks).set(t.values).where(eq(tasks.id, t.id)));
  if (taskInserts.length) batch.push(db.insert(tasks).values(taskInserts));
  if (confirming && quoteId) {
    batch.push(db.update(quotes).set({ status: "accepted", orderId }).where(and(eq(quotes.id, quoteId), eq(quotes.customerId, customer.id))));
  }
  await db.batch(batch as Batch);
  await refreshOrderStage(orderId);
  if (!savingDraft) {
    await syncOutsourcingPOs(orderId, me);
    revalidatePath("/purchases", "layout");
  }

  const assignedNote = taskInserts.length ? `, ${taskInserts.length} ${taskInserts.length === 1 ? "task" : "tasks"} assigned` : "";
  await logActivity({
    actor: me,
    entityType: "sales_order",
    entityId: orderId,
    action: confirming && existing ? "status_changed" : existing ? "updated" : "created",
    summary: savingDraft
      ? `${me.name} saved a draft order for ${customer.name}`
      : confirming
        ? `${me.name} confirmed order ${number} for ${customer.name}${assignedNote}`
        : `${me.name} updated order ${number}`,
  });
  revalidatePath("/orders");
  revalidatePath("/workshop");
  revalidatePath("/today");
  revalidatePath(`/customers/${customer.id}`);
  return { ok: true, id: orderId, outcome: savingDraft ? "draft" : confirming ? "confirmed" : "updated" };
}

export async function setOrderStage(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const to = z.enum(["ready", "delivered"]).safeParse(text(fd, "to"));
  if (!to.success) return { message: "Unknown stage." };
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) });
  if (!order) return { message: "That order no longer exists." };
  const allowed = to.data === "ready" ? ["confirmed", "stitching"] : ["ready"];
  if (!allowed.includes(order.stage)) return { message: "The order has moved on. Reload the page." };
  await db
    .update(salesOrders)
    .set(to.data === "ready" ? { stage: "ready", readyAt: new Date() } : { stage: "delivered", deliveredAt: new Date() })
    .where(eq(salesOrders.id, id));
  await logActivity({ actor: me, entityType: "sales_order", entityId: id, action: "status_changed", summary: `${me.name} marked order ${order.number} as ${to.data}` });
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  return flashDone(to.data === "ready" ? "Marked ready." : "Marked delivered.");
}

/** Drafts never counted anywhere, so they can be deleted for good. */
export async function deleteDraftOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const order = /^[0-9a-f-]{36}$/.test(id) ? await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, id) }) : undefined;
  if (!order) return { message: "That draft no longer exists." };
  if (order.stage !== "draft") return { message: "Only drafts can be deleted." };
  await db.batch([db.delete(soLines).where(eq(soLines.orderId, id)), db.delete(salesOrders).where(eq(salesOrders.id, id))]);
  await logActivity({ actor: me, entityType: "sales_order", entityId: id, action: "status_changed", summary: `${me.name} deleted a draft order` });
  revalidatePath("/orders");
  revalidatePath("/today");
  await flashDone("Draft deleted.");
  redirect("/orders?view=drafts");
}

/**
 * Excel import with a Branch column: one draft per branch.
 * Every group goes through the same rules as a hand typed order or quote.
 */
export async function importDrafts(input: { mode: "order" | "quote"; docs: unknown[] }): Promise<{ ok?: boolean; count?: number; error?: string }> {
  const me = await requireOwner();
  if (!Array.isArray(input.docs) || input.docs.length === 0 || input.docs.length > 50) return { error: "Nothing to import." };
  const parsedDocs: Doc[] = [];
  for (const raw of input.docs) {
    const parsed = docSchema.safeParse(raw);
    if (!parsed.success) return { error: `A branch group has a problem: ${parsed.error.issues[0]?.message ?? "invalid data"}` };
    parsedDocs.push(parsed.data);
  }
  let count = 0;
  for (const doc of parsedDocs) {
    const res = input.mode === "order" ? await persistOrder(doc, "draft", me) : await persistQuote(doc, me);
    if (!res.ok) return { error: res.message ?? "One group could not be saved.", count };
    count++;
  }
  return { ok: true, count };
}
