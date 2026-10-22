"use server";

import { and, eq, ilike, isNull, max, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { customerMeasurements, customers, measurementFields } from "@/db/schema";
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

export type MeasurementSetResult = { ok?: boolean; error?: string; errors?: Record<string, string[]>; set?: { id: string; label: string; values: { name: string; value: string }[]; createdAt: string } };

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

  const [row] = await db
    .insert(customerMeasurements)
    .values({ customerId: customer.id, label, values, notes: input.notes?.trim() || null, createdBy: me.id })
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
  return { ok: true, set: { id: row.id, label: row.label, values: row.values, createdAt: row.createdAt.toISOString() } };
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
