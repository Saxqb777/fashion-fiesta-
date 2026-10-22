"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { dailyCloses } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { cardTotalOn, cashEntry, clearCashFor, expectedCashOn, POT_LABEL } from "@/lib/cash";
import { todayISO } from "@/lib/dates";
import { moneySchema, text, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { isoDate } from "@/lib/payload";
import { requireOwner } from "@/lib/session";

function refresh() {
  revalidatePath("/money", "layout");
  revalidatePath("/today");
}

/**
 * Daily close: she counts the drawer. A difference is written to the cash book,
 * so tomorrow's cash in hand starts from what is really there.
 */
export async function closeDay(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const counted = moneySchema.safeParse(text(fd, "counted"));
  if (!counted.success || text(fd, "counted") === "") return { errors: { counted: ["Enter the cash you counted, 0 if the drawer is empty."] } };
  const date = todayISO();
  const notes = text(fd, "notes").slice(0, 500) || null;
  const [expected, card, existing] = await Promise.all([expectedCashOn(date), cardTotalOn(date), db.query.dailyCloses.findFirst({ where: eq(dailyCloses.closeDate, date) })]);
  const difference = counted.data - expected;
  const id = existing?.id ?? randomUUID();
  await db.batch([
    existing
      ? db.update(dailyCloses).set({ expectedCashFils: expected, countedCashFils: counted.data, differenceFils: difference, cardTotalFils: card, notes }).where(eq(dailyCloses.id, id))
      : db.insert(dailyCloses).values({ id, closeDate: date, expectedCashFils: expected, countedCashFils: counted.data, differenceFils: difference, cardTotalFils: card, notes, createdBy: me.id }),
    clearCashFor("daily_close", id),
    ...(difference
      ? [cashEntry({ date, pot: "cash", kind: "close_difference", amountFils: difference, description: difference > 0 ? "More cash counted than expected" : "Less cash counted than expected", sourceType: "daily_close", sourceId: id, actorId: me.id })]
      : []),
  ]);
  await logActivity({
    actor: me,
    entityType: "daily_close",
    entityId: id,
    action: existing ? "updated" : "created",
    summary: `${me.name} closed the day: counted ${formatFils(counted.data)}, expected ${formatFils(expected)}${difference ? `, ${difference > 0 ? "over" : "short"} by ${formatFils(Math.abs(difference))}` : ", matches"}`,
  });
  refresh();
  return { ok: true, savedAt: Date.now(), message: difference ? `Day closed. ${difference > 0 ? "Over" : "Short"} by ${formatFils(Math.abs(difference))}.` : "Day closed. The drawer matches." };
}

const moveSchema = z.object({
  from: z.enum(["cash", "bank"]),
  amount: moneySchema.refine((v) => v > 0, "Enter the amount."),
  date: isoDate,
  notes: z.string().trim().max(300).optional().default(""),
});

/** Cash taken to the bank, or cash drawn from the bank. Two rows, same amount. */
export async function moveMoney(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = moveSchema.safeParse({ from: text(fd, "from"), amount: text(fd, "amount"), date: text(fd, "date"), notes: text(fd, "notes") });
  if (!parsed.success) return { errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message]])) };
  const { from, amount, notes } = parsed.data;
  const date = parsed.data.date ?? todayISO();
  const to = from === "cash" ? "bank" : "cash";
  const id = randomUUID();
  const label = from === "cash" ? "Cash deposited in the bank" : "Cash drawn from the bank";
  await db.batch([
    cashEntry({ date, pot: from, kind: "transfer", amountFils: -amount, description: notes ? `${label}. ${notes}` : label, sourceType: "transfer", sourceId: id, actorId: me.id }),
    cashEntry({ date, pot: to, kind: "transfer", amountFils: amount, description: notes ? `${label}. ${notes}` : label, sourceType: "transfer", sourceId: id, actorId: me.id }),
  ]);
  await logActivity({ actor: me, entityType: "cash_book", entityId: id, action: "created", summary: `${me.name} moved ${formatFils(amount)} from ${POT_LABEL[from]} to ${POT_LABEL[to]}` });
  refresh();
  return { ok: true, savedAt: Date.now(), message: `${formatFils(amount)} moved to ${POT_LABEL[to].toLowerCase()}.` };
}
