import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { salaryAdvances, salaryPayments, users } from "@/db/schema";

export const monthOf = (iso: string) => iso.slice(0, 7);

/** The pay date in a month, moved to the month's last day when the month is short. */
export function payDateIn(month: string, payDay: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(payDay, last)).padStart(2, "0")}`;
}

export function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export const monthLabel = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Advances given minus advances already taken off a salary. */
export async function advanceBalances() {
  const [given, taken] = await Promise.all([
    db.select({ userId: salaryAdvances.userId, n: sql<number>`coalesce(sum(${salaryAdvances.amountFils}), 0)::int` }).from(salaryAdvances).groupBy(salaryAdvances.userId),
    db.select({ userId: salaryPayments.userId, n: sql<number>`coalesce(sum(${salaryPayments.advancesDeductedFils}), 0)::int` }).from(salaryPayments).groupBy(salaryPayments.userId),
  ]);
  const out = new Map<string, number>();
  for (const g of given) out.set(g.userId, g.n);
  for (const t of taken) out.set(t.userId, (out.get(t.userId) ?? 0) - t.n);
  return out;
}

/**
 * Everyone with a salary: what is due next, when, and their advance balance.
 * The month to pay is the earliest unpaid month from this month on.
 */
export async function salaryOverview(today: string) {
  const [people, paid, advances] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, salaryFils: users.salaryFils, payDay: users.payDay, isActive: users.isActive })
      .from(users)
      .where(and(isNull(users.deletedAt), isNotNull(users.salaryFils)))
      .orderBy(asc(users.name)),
    db.select({ userId: salaryPayments.userId, month: salaryPayments.month, payDate: salaryPayments.payDate, netFils: salaryPayments.netFils }).from(salaryPayments),
    advanceBalances(),
  ]);
  return people
    .filter((p) => p.isActive && p.salaryFils)
    .map((p) => {
      const payDay = p.payDay ?? 1;
      let month = monthOf(today);
      // The last month paid moves the next one on.
      while (paid.some((x) => x.userId === p.id && x.month === month)) month = nextMonth(month);
      const due = payDateIn(month, payDay);
      const lastPaid = paid.filter((x) => x.userId === p.id).sort((a, b) => b.month.localeCompare(a.month))[0];
      return { ...p, salaryFils: p.salaryFils!, payDay, month, due, daysUntil: daysBetween(today, due), advanceFils: advances.get(p.id) ?? 0, lastPaid: lastPaid ?? null };
    });
}

/** Pay day within three days, or already passed this month and unpaid. */
export async function payDayWarning(today: string) {
  const rows = (await salaryOverview(today)).filter((r) => r.daysUntil <= 3);
  if (!rows.length) return null;
  const totalFils = rows.reduce((s, r) => s + Math.max(0, r.salaryFils - Math.min(r.advanceFils, r.salaryFils)), 0);
  return { count: rows.length, totalFils, soonest: rows.reduce((m, r) => Math.min(m, r.daysUntil), 99) };
}

export async function personPayHistory(userId: string) {
  const [payments, advances] = await Promise.all([
    db.select().from(salaryPayments).where(eq(salaryPayments.userId, userId)).orderBy(sql`${salaryPayments.month} desc`),
    db.select().from(salaryAdvances).where(eq(salaryAdvances.userId, userId)).orderBy(sql`${salaryAdvances.advanceDate} desc`),
  ]);
  return { payments, advances };
}
