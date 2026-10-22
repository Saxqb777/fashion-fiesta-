import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashBook, dailyCloses, payments, posSales, type CashKind, type CashPot, type PaymentMethod } from "@/db/schema";

/** Cash goes in the drawer. Card, transfer and cheque land in the bank. */
export function potFor(method: PaymentMethod): CashPot {
  return method === "cash" ? "cash" : "bank";
}

export const POT_LABEL: Record<CashPot, string> = { cash: "Cash drawer", bank: "Bank" };
export const CASH_KIND_LABEL: Record<CashKind, string> = {
  opening: "Opening",
  customer_payment: "Customer payment",
  quick_sale: "Quick sale",
  supplier_payment: "Supplier payment",
  expense: "Expense",
  salary: "Salary",
  advance: "Salary advance",
  embroidery: "Embroidery",
  transfer: "Moved between pots",
  close_difference: "Daily close difference",
};

/** One cash book row, ready to go into a db.batch with the record that caused it. */
export function cashEntry(e: {
  date: string;
  pot: CashPot;
  kind: CashKind;
  amountFils: number;
  description: string;
  sourceType: string;
  sourceId: string;
  actorId?: string | null;
}) {
  return db.insert(cashBook).values({
    entryDate: e.date,
    pot: e.pot,
    kind: e.kind,
    amountFils: e.amountFils,
    description: e.description,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    createdBy: e.actorId ?? null,
  });
}

/** Balance of each pot, optionally up to and including a date. */
export async function potBalances(upTo?: string) {
  const rows = await db
    .select({ pot: cashBook.pot, n: sql<number>`coalesce(sum(${cashBook.amountFils}), 0)::int` })
    .from(cashBook)
    .where(upTo ? lte(cashBook.entryDate, upTo) : undefined)
    .groupBy(cashBook.pot);
  return { cash: rows.find((r) => r.pot === "cash")?.n ?? 0, bank: rows.find((r) => r.pot === "bank")?.n ?? 0 };
}

/** Removes the rows a record wrote, so it can write them again after a change. */
export function clearCashFor(sourceType: string, sourceId: string) {
  return db.delete(cashBook).where(and(eq(cashBook.sourceType, sourceType), eq(cashBook.sourceId, sourceId)));
}

/** Card money taken on a day: customer payments and quick sales by card. */
export async function cardTotalOn(date: string) {
  const [[p], [s]] = await Promise.all([
    db.select({ n: sql<number>`coalesce(sum(${payments.amountFils}), 0)::int` }).from(payments).where(and(eq(payments.paymentDate, date), eq(payments.method, "card"))),
    db.select({ n: sql<number>`coalesce(sum(${posSales.totalFils}), 0)::int` }).from(posSales).where(and(eq(posSales.saleDate, date), eq(posSales.method, "card"))),
  ]);
  return p.n + s.n;
}

/** What the drawer should hold at the end of a day, leaving out that day's own close difference. */
export async function expectedCashOn(date: string) {
  const { cash } = await potBalances(date);
  const close = await db.query.dailyCloses.findFirst({ where: eq(dailyCloses.closeDate, date) });
  return cash - (close?.differenceFils ?? 0);
}

