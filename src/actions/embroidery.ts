"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customers, embroideryJobs, operatorSettlements, salesOrders } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { cashEntry } from "@/lib/cash";
import { todayISO } from "@/lib/dates";
import { operatorBalance } from "@/lib/embroidery";
import { flashDone } from "@/lib/flash";
import { moneySchema, text, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { isoDate, issuesToErrors } from "@/lib/payload";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

function refresh(id?: string) {
  revalidatePath("/workshop/embroidery", "layout");
  revalidatePath("/money", "layout");
  revalidatePath("/today");
  if (id) revalidatePath(`/workshop/embroidery/${id}`);
}

const jobSchema = z
  .object({
    side: z.enum(["shop", "operator"]),
    customerId: z.string().optional().transform((v) => (isUuid(v) ? v : null)),
    orderId: z.string().optional().transform((v) => (isUuid(v) ? v : null)),
    customerName: z.string().trim().max(120).optional().default(""),
    date: isoDate,
    description: z.string().trim().min(2, "Say what is embroidered, for example Logo on chest.").max(200),
    pieces: z.coerce.number({ message: "Enter pieces." }).int("Whole pieces.").min(1, "At least 1."),
    price: moneySchema.refine((v) => v > 0, "Enter the price for the embroidery."),
    designFileUrl: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/designs\//i.test(v) ? v : null)),
    designFileName: z.string().trim().max(200).optional().default(""),
    threadColours: z.string().trim().max(300).optional().default(""),
    designSize: z.string().trim().max(100).optional().default(""),
    placement: z.string().trim().max(200).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.side === "shop" && !v.customerId) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Pick the customer." });
    if (v.side === "operator" && !v.customerName) ctx.addIssue({ code: "custom", path: ["customerName"], message: "Type the operator's customer." });
  });

/** A job for the machine. Price is before VAT; the split uses today's share and keeps it. */
export async function saveEmbroideryJob(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {}
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const j = parsed.data;
  if (j.customerId && !(await db.query.customers.findFirst({ where: eq(customers.id, j.customerId) }))) return { errors: { customerId: ["Pick the customer."] } };
  if (j.orderId && !(await db.query.salesOrders.findFirst({ where: and(eq(salesOrders.id, j.orderId), eq(salesOrders.customerId, j.customerId ?? "")) }))) {
    return { errors: { orderId: ["That order is not for this customer."] } };
  }
  const existingId = String(raw.id ?? "");
  const existing = isUuid(existingId) ? await db.query.embroideryJobs.findFirst({ where: eq(embroideryJobs.id, existingId) }) : undefined;
  const { embroideryShopSharePercent } = await getSettings();
  const values = {
    side: j.side,
    customerId: j.side === "shop" ? j.customerId : null,
    orderId: j.side === "shop" ? j.orderId : null,
    customerName: j.side === "operator" ? j.customerName : null,
    jobDate: j.date ?? todayISO(),
    description: j.description,
    pieces: j.pieces,
    priceFils: j.price,
    designFileUrl: j.designFileUrl,
    designFileName: j.designFileUrl ? j.designFileName || "Design file" : null,
    threadColours: j.threadColours || null,
    designSize: j.designSize || null,
    placement: j.placement || null,
    notes: j.notes || null,
  };
  const id = existing?.id ?? randomUUID();
  if (existing) await db.update(embroideryJobs).set(values).where(eq(embroideryJobs.id, id));
  else await db.insert(embroideryJobs).values({ id, ...values, shopSharePercent: embroideryShopSharePercent, createdBy: me.id });
  await logActivity({ actor: me, entityType: "embroidery_job", entityId: id, action: existing ? "updated" : "created", summary: `${me.name} ${existing ? "updated" : "added"} embroidery job ${j.description}, ${formatFils(j.price)}` });
  refresh(id);
  await flashDone(existing ? "Job saved." : "Embroidery job added.");
  redirect(`/workshop/embroidery/${id}`);
}

/** Done jobs count in the balance with the operator. */
export async function setEmbroideryDone(id: string, done: boolean): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  const job = isUuid(id) ? await db.query.embroideryJobs.findFirst({ where: eq(embroideryJobs.id, id) }) : undefined;
  if (!job) return { error: "That job no longer exists." };
  await db.update(embroideryJobs).set({ status: done ? "done" : "to_do", doneAt: done ? new Date() : null }).where(eq(embroideryJobs.id, id));
  await logActivity({ actor: me, entityType: "embroidery_job", entityId: id, action: "status_changed", summary: `${me.name} marked embroidery ${job.description} ${done ? "done" : "not done"}` });
  refresh(id);
  return { ok: true };
}

const settleSchema = z.object({
  direction: z.enum(["to_operator", "from_operator"]),
  amount: moneySchema.refine((v) => v > 0, "Enter the amount."),
  date: isoDate,
  pot: z.enum(["cash", "bank"]),
  notes: z.string().trim().max(300).optional().default(""),
});

/** Money between the shop and the operator. Goes in the cash book. */
export async function settleOperator(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = settleSchema.safeParse({ direction: text(fd, "direction"), amount: text(fd, "amount"), date: text(fd, "date"), pot: text(fd, "pot") || "cash", notes: text(fd, "notes") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const s = parsed.data;
  const { embroideryOperatorName } = await getSettings();
  const who = embroideryOperatorName || "the operator";
  const id = randomUUID();
  const date = s.date ?? todayISO();
  await db.batch([
    db.insert(operatorSettlements).values({ id, settleDate: date, direction: s.direction, amountFils: s.amount, pot: s.pot, notes: s.notes || null, createdBy: me.id }),
    cashEntry({
      date,
      pot: s.pot,
      kind: "embroidery",
      amountFils: s.direction === "to_operator" ? -s.amount : s.amount,
      description: s.direction === "to_operator" ? `Paid ${who}, embroidery share` : `Received from ${who}, shop share`,
      sourceType: "operator_settlement",
      sourceId: id,
      actorId: me.id,
    }),
  ]);
  const left = await operatorBalance();
  await logActivity({ actor: me, entityType: "operator_settlement", entityId: id, action: "created", summary: `${me.name} ${s.direction === "to_operator" ? `paid ${who}` : `received from ${who}`} ${formatFils(s.amount)}` });
  refresh();
  return { ok: true, savedAt: Date.now(), message: left === 0 ? "All settled." : `Saved. ${left > 0 ? `Still owed to ${who}` : `${who} still owes the shop`} ${formatFils(Math.abs(left))}.` };
}

/** Earlier designs for a customer, to reuse on a new job. */
export async function customerDesigns(customerId: string) {
  await requireOwner();
  if (!isUuid(customerId)) return { designs: [], orders: [] };
  const [designs, orders] = await Promise.all([
    db
      .select({
        id: embroideryJobs.id,
        description: embroideryJobs.description,
        designFileUrl: embroideryJobs.designFileUrl,
        designFileName: embroideryJobs.designFileName,
        threadColours: embroideryJobs.threadColours,
        designSize: embroideryJobs.designSize,
        placement: embroideryJobs.placement,
        jobDate: embroideryJobs.jobDate,
      })
      .from(embroideryJobs)
      .where(and(eq(embroideryJobs.customerId, customerId), isNotNull(embroideryJobs.designFileUrl)))
      .orderBy(desc(embroideryJobs.jobDate))
      .limit(10),
    db
      .select({ id: salesOrders.id, number: salesOrders.number, orderDate: salesOrders.orderDate })
      .from(salesOrders)
      .where(and(eq(salesOrders.customerId, customerId), isNotNull(salesOrders.number)))
      .orderBy(desc(salesOrders.orderDate))
      .limit(20),
  ]);
  return { designs, orders };
}
