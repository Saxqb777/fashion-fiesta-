import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveryNoteLines, invoiceLines, soLines } from "@/db/schema";

/** Quantities already delivered and invoiced for each line of an order. */
export async function orderLineProgress(orderId: string) {
  const [lines, delivered, invoiced] = await Promise.all([
    db.select().from(soLines).where(eq(soLines.orderId, orderId)).orderBy(soLines.sort),
    db
      .select({ id: deliveryNoteLines.soLineId, n: sql<number>`sum(${deliveryNoteLines.qty})::int` })
      .from(deliveryNoteLines)
      .innerJoin(soLines, eq(soLines.id, deliveryNoteLines.soLineId))
      .where(eq(soLines.orderId, orderId))
      .groupBy(deliveryNoteLines.soLineId),
    db
      .select({ id: invoiceLines.soLineId, n: sql<number>`sum(${invoiceLines.qty})::int` })
      .from(invoiceLines)
      .innerJoin(soLines, eq(soLines.id, invoiceLines.soLineId))
      .where(eq(soLines.orderId, orderId))
      .groupBy(invoiceLines.soLineId),
  ]);
  return lines.map((l) => ({
    ...l,
    delivered: delivered.find((d) => d.id === l.id)?.n ?? 0,
    invoiced: invoiced.find((d) => d.id === l.id)?.n ?? 0,
  }));
}

