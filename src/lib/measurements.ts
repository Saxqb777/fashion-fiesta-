import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { measurementFields } from "@/db/schema";

const DEFAULT_FIELDS = ["Length", "Shoulder", "Bust", "Waist", "Hips", "Sleeve", "Armhole", "Neck"];

/** Measurement names, in order. Seeds the usual set on first use. */
export async function getMeasurementFields() {
  let rows = await db.select().from(measurementFields).orderBy(asc(measurementFields.sortOrder), asc(measurementFields.createdAt));
  if (rows.length === 0) {
    await db.insert(measurementFields).values(DEFAULT_FIELDS.map((name, i) => ({ name, sortOrder: (i + 1) * 10 })));
    rows = await db.select().from(measurementFields).orderBy(asc(measurementFields.sortOrder));
  }
  return rows.filter((r) => !r.deletedAt);
}

export const activeOnly = isNull(measurementFields.deletedAt);
