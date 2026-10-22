"use server";

import { and, asc, eq, ilike, isNull, max, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { customerMeasurements, customers, measurementFields, measurementTemplates, productCategories } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requiredName, text, type FormState } from "@/lib/forms";
import { getMeasurementFields } from "@/lib/measurements";
import { requireOwner } from "@/lib/session";

const saved = (message: string): FormState => ({ ok: true, message, savedAt: Date.now() });

/* ---------- Fields (Settings) ---------- */

export async function saveMeasurementField(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = requiredName("Enter a measurement name.").safeParse(text(fd, "name"));
  if (!parsed.success) return { errors: { name: [parsed.error.issues[0]?.message ?? "Enter a name."] } };
  const name = parsed.data;
  const clash = await db.query.measurementFields.findFirst({
    where: and(ilike(measurementFields.name, name), isNull(measurementFields.deletedAt), id ? ne(measurementFields.id, id) : undefined),
  });
  if (clash) return { errors: { name: ["That measurement already exists."] } };
  if (id) {
    await db.update(measurementFields).set({ name }).where(eq(measurementFields.id, id));
  } else {
    const [{ top }] = await db.select({ top: max(measurementFields.sortOrder) }).from(measurementFields);
    await db.insert(measurementFields).values({ name, sortOrder: (top ?? 0) + 10, createdBy: me.id });
  }
  await logActivity({ actor: me, entityType: "measurement_field", entityId: id || null, action: id ? "updated" : "created", summary: `${me.name} ${id ? "renamed a measurement to" : "added measurement"} ${name}` });
  revalidatePath("/settings/measurements");
  return saved(id ? "Measurement renamed." : `${name} added.`);
}

export async function archiveMeasurementField(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const row = await db.query.measurementFields.findFirst({ where: eq(measurementFields.id, id) });
  if (!row) return { message: "That measurement no longer exists." };
  await db.update(measurementFields).set({ deletedAt: new Date() }).where(eq(measurementFields.id, id));
  await logActivity({ actor: me, entityType: "measurement_field", entityId: id, action: "status_changed", summary: `${me.name} archived measurement ${row.name}` });
  revalidatePath("/settings/measurements");
  return saved(`${row.name} archived. Saved measurements keep it.`);
}

/* ---------- Customer measurement sets ---------- */

export type MeasurementSetResult = { ok?: boolean; error?: string; errors?: Record<string, string[]>; set?: { id: string; label: string; values: { name: string; value: string }[]; createdAt: string; templateId: string | null; templateName: string | null } };

/**
 * Saves a set. Editing never overwrites: the old set is archived and a new one saved,
 * so orders keep pointing at what was measured at the time.
 */
export async function saveMeasurementSet(input: {
  customerId: string;
  replacesId?: string | null;
  label: string;
  values: Record<string, string>;
  notes?: string;
  templateId?: string | null;
}): Promise<MeasurementSetResult> {
  const me = await requireOwner();
  const customer = /^[0-9a-f-]{36}$/.test(input.customerId) ? await db.query.customers.findFirst({ where: eq(customers.id, input.customerId) }) : undefined;
  if (!customer) return { error: "That customer no longer exists." };
  const label = input.label.trim();
  if (label.length < 1) return { errors: { label: ["Name this set, for example Self or Daughter."] } };
  const fields = await getMeasurementFields();
  const values = fields
    .map((f) => ({ name: f.name, value: String(input.values[f.name] ?? "").trim().slice(0, 20) }))
    .filter((v) => v.value !== "");
  if (!values.length) return { errors: { values: ["Enter at least one measurement."] } };

  const template = input.templateId && /^[0-9a-f-]{36}$/.test(input.templateId) ? await db.query.measurementTemplates.findFirst({ where: eq(measurementTemplates.id, input.templateId) }) : undefined;
  const [row] = await db
    .insert(customerMeasurements)
    .values({ customerId: customer.id, label, values, notes: input.notes?.trim() || null, templateId: template?.id ?? null, templateName: template?.name ?? null, createdBy: me.id })
    .returning();
  if (input.replacesId) {
    await db
      .update(customerMeasurements)
      .set({ deletedAt: new Date() })
      .where(and(eq(customerMeasurements.id, input.replacesId), eq(customerMeasurements.customerId, customer.id)));
  }
  await logActivity({
    actor: me,
    entityType: "customer_measurement",
    entityId: row.id,
    action: input.replacesId ? "updated" : "created",
    summary: `${me.name} ${input.replacesId ? "re measured" : "measured"} ${customer.name}: ${label}`,
  });
  revalidatePath(`/customers/${customer.id}`);
  return { ok: true, set: { id: row.id, label: row.label, values: row.values, createdAt: row.createdAt.toISOString(), templateId: row.templateId, templateName: row.templateName } };
}

export async function archiveMeasurementSet(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const row = await db.query.customerMeasurements.findFirst({ where: eq(customerMeasurements.id, id) });
  if (!row) return { message: "That measurement set no longer exists." };
  await db.update(customerMeasurements).set({ deletedAt: new Date() }).where(eq(customerMeasurements.id, id));
  await logActivity({ actor: me, entityType: "customer_measurement", entityId: id, action: "status_changed", summary: `${me.name} archived measurements ${row.label}` });
  revalidatePath(`/customers/${row.customerId}`);
  return saved(`${row.label} archived. Orders keep their copy.`);
}

/* ---------- Garment templates ---------- */

export async function saveMeasurementTemplate(input: { id?: string | null; name: string; fieldIds: string[] }): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  const name = input.name.trim();
  if (name.length < 2) return { error: "Name the garment, for example Pant." };
  const fields = await db.select({ id: measurementFields.id }).from(measurementFields).where(isNull(measurementFields.deletedAt));
  const valid = new Set(fields.map((f) => f.id));
  const fieldIds = [...new Set(input.fieldIds)].filter((id) => valid.has(id));
  if (!fieldIds.length) return { error: "Pick at least one measurement." };
  const clash = await db.query.measurementTemplates.findFirst({
    where: and(ilike(measurementTemplates.name, name), isNull(measurementTemplates.deletedAt), input.id ? ne(measurementTemplates.id, input.id) : undefined),
  });
  if (clash) return { error: `There is already a template called ${clash.name}.` };
  if (input.id) {
    await db.update(measurementTemplates).set({ name, fieldIds }).where(eq(measurementTemplates.id, input.id));
  } else {
    const [{ top }] = await db.select({ top: max(measurementTemplates.sortOrder) }).from(measurementTemplates);
    await db.insert(measurementTemplates).values({ name, fieldIds, sortOrder: (top ?? 0) + 10, createdBy: me.id });
  }
  await logActivity({ actor: me, entityType: "settings", action: input.id ? "updated" : "created", summary: `${me.name} ${input.id ? "changed" : "added"} the ${name} measurement template` });
  revalidatePath("/settings/measurements");
  return { ok: true };
}

export async function moveMeasurementTemplate(id: string, direction: "up" | "down") {
  await requireOwner();
  const rows = (await db.select().from(measurementTemplates).orderBy(asc(measurementTemplates.sortOrder), asc(measurementTemplates.createdAt))).filter((r) => !r.deletedAt);
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (const [k, r] of rows.entries()) await db.update(measurementTemplates).set({ sortOrder: (k + 1) * 10 }).where(eq(measurementTemplates.id, r.id));
  revalidatePath("/settings/measurements");
}

export async function archiveMeasurementTemplate(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const row = await db.query.measurementTemplates.findFirst({ where: eq(measurementTemplates.id, id) });
  if (!row) return { message: "That template no longer exists." };
  await db.batch([
    db.update(measurementTemplates).set({ deletedAt: new Date() }).where(eq(measurementTemplates.id, id)),
    db.update(productCategories).set({ measurementTemplateId: null }).where(eq(productCategories.measurementTemplateId, id)),
  ]);
  await logActivity({ actor: me, entityType: "settings", action: "status_changed", summary: `${me.name} archived the ${row.name} measurement template` });
  revalidatePath("/settings/measurements");
  revalidatePath("/settings/categories");
  return { ok: true, message: `${row.name} archived.`, savedAt: Date.now() };
}

/** Each product category maps to one template. */
export async function setCategoryTemplate(categoryId: string, templateId: string | null) {
  const me = await requireOwner();
  const cat = /^[0-9a-f-]{36}$/.test(categoryId) ? await db.query.productCategories.findFirst({ where: eq(productCategories.id, categoryId) }) : undefined;
  if (!cat) return { error: "That category no longer exists." };
  const template = templateId && /^[0-9a-f-]{36}$/.test(templateId) ? await db.query.measurementTemplates.findFirst({ where: eq(measurementTemplates.id, templateId) }) : undefined;
  await db.update(productCategories).set({ measurementTemplateId: template?.id ?? null }).where(eq(productCategories.id, cat.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} set ${cat.name} to measure with ${template?.name ?? "all measurements"}` });
  revalidatePath("/settings/categories");
  return { ok: true };
}
