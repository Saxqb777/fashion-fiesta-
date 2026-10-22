"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ilike, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { cashEntry, clearCashFor } from "@/lib/cash";
import { todayISO } from "@/lib/dates";
import { flashDone } from "@/lib/flash";
import { moneySchema, optionalTrn, requiredName, text, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { isoDate, issuesToErrors } from "@/lib/payload";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);

function refresh() {
  revalidatePath("/money", "layout");
  revalidatePath("/today");
  revalidatePath("/settings/categories");
}

/* ---------- Categories ---------- */

export async function saveExpenseCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = requiredName("Enter a category name.").safeParse(text(fd, "name"));
  if (!parsed.success) return { errors: { name: [parsed.error.issues[0]?.message ?? "Enter a name."] } };
  const clash = await db.query.expenseCategories.findFirst({
    where: and(ilike(expenseCategories.name, parsed.data), isNull(expenseCategories.deletedAt), id ? ne(expenseCategories.id, id) : undefined),
  });
  if (clash) return { errors: { name: ["That category already exists."] } };
  if (isUuid(id)) await db.update(expenseCategories).set({ name: parsed.data }).where(eq(expenseCategories.id, id));
  else await db.insert(expenseCategories).values({ name: parsed.data, createdBy: me.id });
  await logActivity({ actor: me, entityType: "expense_category", entityId: id || null, action: id ? "updated" : "created", summary: `${me.name} ${id ? "renamed an expense category to" : "added expense category"} ${parsed.data}` });
  refresh();
  return { ok: true, savedAt: Date.now(), message: id ? "Category renamed." : `${parsed.data} added.` };
}

export async function archiveExpenseCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const row = isUuid(id) ? await db.query.expenseCategories.findFirst({ where: eq(expenseCategories.id, id) }) : undefined;
  if (!row) return { message: "That category no longer exists." };
  await db.update(expenseCategories).set({ deletedAt: new Date() }).where(eq(expenseCategories.id, id));
  await logActivity({ actor: me, entityType: "expense_category", entityId: id, action: "status_changed", summary: `${me.name} archived expense category ${row.name}` });
  refresh();
  return { ok: true, savedAt: Date.now(), message: `${row.name} archived. Past expenses keep it.` };
}

/* ---------- Expenses ---------- */

const expenseSchema = z.object({
  date: isoDate,
  categoryId: z.string().refine(isUuid, "Pick a category."),
  description: z.string().trim().min(2, "Say what it was for.").max(200),
  payee: z.string().trim().max(120).optional().default(""),
  payeeTrn: optionalTrn,
  amount: moneySchema.refine((v) => v > 0, "Enter the amount paid."),
  vat: z.boolean().default(false),
  pot: z.enum(["cash", "bank"], { message: "Pick where it was paid from." }),
  receiptUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(v) ? v : null)),
  notes: z.string().trim().max(1000).optional().default(""),
});

function readExpense(fd: FormData) {
  return expenseSchema.safeParse({
    date: text(fd, "date"),
    categoryId: text(fd, "categoryId"),
    description: text(fd, "description"),
    payee: text(fd, "payee"),
    payeeTrn: text(fd, "payeeTrn"),
    amount: text(fd, "amount"),
    vat: text(fd, "vat") === "on",
    pot: text(fd, "pot"),
    receiptUrl: text(fd, "receiptUrl"),
    notes: text(fd, "notes"),
  });
}

/** An expense, new or corrected. The amount includes VAT; VAT is worked out only with the payee's TRN. */
export async function saveExpense(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = readExpense(fd);
  if (!parsed.success) return { message: "Check the highlighted fields.", errors: issuesToErrors(parsed.error) };
  const e = parsed.data;
  if (e.vat && !e.payeeTrn) return { errors: { payeeTrn: ["VAT can only be claimed with their TRN. Type it from the receipt, or untick VAT."] } };
  const category = await db.query.expenseCategories.findFirst({ where: eq(expenseCategories.id, e.categoryId) });
  if (!category) return { errors: { categoryId: ["Pick a category."] } };
  const existingId = text(fd, "id");
  const existing = isUuid(existingId) ? await db.query.expenses.findFirst({ where: eq(expenses.id, existingId) }) : undefined;
  if (existingId && !existing) return { message: "That expense no longer exists." };
  if (existing?.sourceType) return { message: "This expense comes from a salary payment and changes there." };
  const { vatRateBp } = await getSettings();
  const vatFils = e.vat ? Math.round((e.amount * vatRateBp) / (10000 + vatRateBp)) : 0;
  const date = e.date ?? todayISO();
  const id = existing?.id ?? randomUUID();
  const values = {
    expenseDate: date,
    categoryId: category.id,
    description: e.description,
    payee: e.payee || null,
    payeeTrn: e.payeeTrn,
    amountFils: e.amount,
    vatFils,
    pot: e.pot,
    receiptUrl: e.receiptUrl,
    notes: e.notes || null,
  };
  await db.batch([
    existing ? db.update(expenses).set(values).where(eq(expenses.id, id)) : db.insert(expenses).values({ id, ...values, createdBy: me.id }),
    clearCashFor("expense", id),
    cashEntry({ date, pot: e.pot, kind: "expense", amountFils: -e.amount, description: `${category.name}: ${e.description}`, sourceType: "expense", sourceId: id, actorId: me.id }),
  ]);
  await logActivity({ actor: me, entityType: "expense", entityId: id, action: existing ? "updated" : "created", summary: `${me.name} ${existing ? "corrected" : "recorded"} expense ${e.description}, ${formatFils(e.amount)}` });
  refresh();
  await flashDone(existing ? "Expense corrected." : `${formatFils(e.amount)} for ${e.description} recorded.`);
  redirect("/money/expenses");
}
