import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { numberSequences, type DocumentType } from "@/db/schema";
import { getSequences } from "./settings";

/** Takes the next number atomically. A number is never reused, even if the save that took it fails. */
export async function nextDocumentNumber(docType: DocumentType) {
  await getSequences();
  const [row] = await db
    .update(numberSequences)
    .set({ nextNumber: sql`${numberSequences.nextNumber} + 1` })
    .where(eq(numberSequences.docType, docType))
    .returning({ prefix: numberSequences.prefix, taken: sql<number>`${numberSequences.nextNumber} - 1`, padding: numberSequences.padding });
  return `${row.prefix}-${String(row.taken).padStart(row.padding, "0")}`;
}
