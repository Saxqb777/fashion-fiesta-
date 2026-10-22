"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { expenseCategories, expenses, salaryAdvances, salaryPayments, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { cashEntry } from "@/lib/cash";
import { todayISO } from "@/lib/dates";
import { moneySchema, text, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { isoDate, issuesToErrors } from "@/lib/payload";
import { advanceBalances, monthLabel } from "@/lib/salaries";
import { requireOwner } from "@/lib/session";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);

function refresh(userId: string) {
  revalidatePath("/settings/team", "layout");
  revalidatePath(`/settings/team/${userId}`);
  revalidatePath("/money", "layout");
  revalidatePath("/today");
}

async function person(id: string) {
  return isUuid(id) ? db.query.users.findFirst({ where: and(eq(users.id, id), isNull(users.deletedAt)) }) : undefined;
}

const salarySchema = z.object({
  salary: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 2500, or leave it empty.")
    .transform((v) => (v === "" ? null : Math.round(Number(v) * 100))),
  payDay: z.coerce.number({ message: "A day from 1 to 31." }).int().min(1, "A day from 1 to 31.").max(31, "A day from 1 to 31."),
});

export async function saveSalary(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const p = await person(text(fd, "userId"));
  if (!p) return { message: "That person is no longer on the team." };
  const parsed = salarySchema.safeParse({ salary: text(fd, "salary"), payDay: text(fd, "payDay") || "1" });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  await db.update(users).set({ salaryFils: parsed.data.salary, payDay: parsed.data.payDay }).where(eq(users.id, p.id));
  await logActivity({ actor: me, entityType: "user", entityId: p.id, action: "updated", summary: `${me.name} set ${p.name}'s salary to ${parsed.data.salary ? formatFils(parsed.data.salary) : "none"}, paid on day ${parsed.data.payDay}` });
  refresh(p.id);
  return { ok: true, savedAt: Date.now(), message: "Salary saved." };
}

const advanceSchema = z.object({
  amount: moneySchema.refine((v) => v > 0, "Enter the amount."),
  date: isoDate,
  pot: z.enum(["cash", "bank"]),
  notes: z.string().trim().max(300).optional().default(""),
});

/** Money given ahead of pay day. Taken off the next salary by itself. */
export async function giveAdvance(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const p = await person(text(fd, "userId"));
  if (!p) return { message: "That person is no longer on the team." };
  const parsed = advanceSchema.safeParse({ amount: text(fd, "amount"), date: text(fd, "date"), pot: text(fd, "pot") || "cash", notes: text(fd, "notes") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const a = parsed.data;
  const id = randomUUID();
  const date = a.date ?? todayISO();
  await db.batch([
    db.insert(salaryAdvances).values({ id, userId: p.id, advanceDate: date, amountFils: a.amount, pot: a.pot, notes: a.notes || null, createdBy: me.id }),
    cashEntry({ date, pot: a.pot, kind: "advance", amountFils: -a.amount, description: `Advance to ${p.name}`, sourceType: "salary_advance", sourceId: id, actorId: me.id }),
  ]);
  await logActivity({ actor: me, entityType: "user", entityId: p.id, action: "created", summary: `${me.name} gave ${p.name} an advance of ${formatFils(a.amount)}` });
  refresh(p.id);
  return { ok: true, savedAt: Date.now(), message: `${formatFils(a.amount)} advance to ${p.name} saved.` };
}

const paySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Pick the month."),
  gross: moneySchema.refine((v) => v > 0, "Enter the salary for this month."),
  deduct: moneySchema,
  date: isoDate,
  pot: z.enum(["cash", "bank"]),
  notes: z.string().trim().max(300).optional().default(""),
});

/**
 * Pay day. The whole salary is the expense; advances already given are taken off,
 * and only the rest leaves the cash book now.
 */
export async function paySalary(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const p = await person(text(fd, "userId"));
  if (!p) return { message: "That person is no longer on the team." };
  const parsed = paySchema.safeParse({ month: text(fd, "month"), gross: text(fd, "gross"), deduct: text(fd, "deduct") || "0", date: text(fd, "date"), pot: text(fd, "pot") || "cash", notes: text(fd, "notes") });
  if (!parsed.success) return { errors: issuesToErrors(parsed.error) };
  const s = parsed.data;
  const balance = (await advanceBalances()).get(p.id) ?? 0;
  if (s.deduct > balance) return { errors: { deduct: [`Only ${formatFils(balance)} in advances to take off.`] } };
  if (s.deduct > s.gross) return { errors: { deduct: ["Take off no more than the salary."] } };
  const already = await db.query.salaryPayments.findFirst({ where: and(eq(salaryPayments.userId, p.id), eq(salaryPayments.month, s.month)) });
  if (already) return { message: `${p.name} is already paid for ${monthLabel(s.month)}.` };
  let category = await db.query.expenseCategories.findFirst({ where: and(ilike(expenseCategories.name, "Salaries"), isNull(expenseCategories.deletedAt)) });
  if (!category) [category] = await db.insert(expenseCategories).values({ name: "Salaries", createdBy: me.id }).returning();
  const id = randomUUID();
  const date = s.date ?? todayISO();
  const net = s.gross - s.deduct;
  await db.batch([
    db.insert(salaryPayments).values({ id, userId: p.id, month: s.month, payDate: date, grossFils: s.gross, advancesDeductedFils: s.deduct, netFils: net, pot: s.pot, notes: s.notes || null, createdBy: me.id }),
    db.insert(expenses).values({
      expenseDate: date,
      categoryId: category.id,
      description: `${p.name}, salary ${monthLabel(s.month)}`,
      payee: p.name,
      amountFils: s.gross,
      vatFils: 0,
      pot: s.pot,
      notes: s.deduct ? `${formatFils(s.deduct)} taken off from advances.` : null,
      sourceType: "salary_payment",
      sourceId: id,
      createdBy: me.id,
    }),
    ...(net > 0 ? [cashEntry({ date, pot: s.pot, kind: "salary", amountFils: -net, description: `${p.name}, salary ${monthLabel(s.month)}`, sourceType: "salary_payment", sourceId: id, actorId: me.id })] : []),
  ]);
  await logActivity({ actor: me, entityType: "user", entityId: p.id, action: "created", summary: `${me.name} paid ${p.name} ${formatFils(net)} for ${monthLabel(s.month)}${s.deduct ? `, ${formatFils(s.deduct)} advance taken off` : ""}` });
  refresh(p.id);
  return { ok: true, savedAt: Date.now(), message: `${p.name} paid for ${monthLabel(s.month)}.` };
}
