import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { measurementFields, measurementTemplates } from "@/db/schema";

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

const DEFAULT_TEMPLATES: [string, string[]][] = [
  ["Pant", ["Waist", "Hips", "Length", "Inseam", "Thigh", "Bottom"]],
  ["Shirt or Tunic", ["Shoulder", "Bust", "Waist", "Sleeve", "Armhole", "Neck", "Length"]],
  ["Abaya", ["Shoulder", "Bust", "Sleeve", "Length", "Width"]],
  ["Jacket", ["Shoulder", "Bust", "Waist", "Sleeve", "Length"]],
  ["Skirt", ["Waist", "Hips", "Length"]],
];

export type TemplateView = { id: string; name: string; fieldIds: string[]; fields: string[] };

/** Garment templates in order, with their field names. Seeds the usual five, adding any missing fields, on first use. */
export async function getMeasurementTemplates(): Promise<TemplateView[]> {
  let rows = await db.select().from(measurementTemplates).orderBy(asc(measurementTemplates.sortOrder), asc(measurementTemplates.createdAt));
  let fields = await getMeasurementFields();
  if (rows.length === 0) {
    const all = await db.select().from(measurementFields);
    const idOf = new Map(all.filter((f) => !f.deletedAt).map((f) => [f.name.toLowerCase(), f.id]));
    let top = Math.max(0, ...all.map((f) => f.sortOrder));
    for (const [, names] of DEFAULT_TEMPLATES) {
      for (const name of names) {
        if (idOf.has(name.toLowerCase())) continue;
        top += 10;
        const [row] = await db.insert(measurementFields).values({ name, sortOrder: top }).returning({ id: measurementFields.id });
        idOf.set(name.toLowerCase(), row.id);
      }
    }
    await db
      .insert(measurementTemplates)
      .values(DEFAULT_TEMPLATES.map(([name, names], i) => ({ name, fieldIds: names.map((n) => idOf.get(n.toLowerCase())!), sortOrder: (i + 1) * 10 })))
      .onConflictDoNothing();
    rows = await db.select().from(measurementTemplates).orderBy(asc(measurementTemplates.sortOrder), asc(measurementTemplates.createdAt));
    fields = await getMeasurementFields();
  }
  const nameOf = new Map(fields.map((f) => [f.id, f.name]));
  return rows
    .filter((r) => !r.deletedAt)
    .map((r) => {
      const ids = r.fieldIds.filter((id) => nameOf.has(id));
      return { id: r.id, name: r.name, fieldIds: ids, fields: ids.map((id) => nameOf.get(id)!) };
    });
}

