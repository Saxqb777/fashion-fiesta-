import { cache } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { numberSequences, settings } from "@/db/schema";
import { DEFAULT_COMPANY, DEFAULT_SEQUENCES, DOCUMENT_TYPES } from "./defaults";

/** The single settings row. Created with company defaults on first use. */
export const getSettings = cache(async () => {
  const row = await db.query.settings.findFirst();
  if (row) return row;
  const [created] = await db.insert(settings).values(DEFAULT_COMPANY).returning();
  await db.insert(numberSequences).values(DEFAULT_SEQUENCES).onConflictDoNothing();
  return created;
});

export const getSequences = cache(async () => {
  let rows = await db.select().from(numberSequences).orderBy(asc(numberSequences.createdAt));
  if (rows.length < DOCUMENT_TYPES.length) {
    await db.insert(numberSequences).values(DEFAULT_SEQUENCES).onConflictDoNothing();
    rows = await db.select().from(numberSequences);
  }
  const order = new Map(DOCUMENT_TYPES.map((d, i) => [d.type, i]));
  return rows.sort((a, b) => (order.get(a.docType) ?? 0) - (order.get(b.docType) ?? 0));
});
