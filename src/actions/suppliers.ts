"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import {
  fieldErrors,
  optionalDays,
  optionalEmail,
  optionalText,
  optionalTrn,
  requiredName,
  text,
  type FormState,
} from "@/lib/forms";
import { requireOwner } from "@/lib/session";

const supplierSchema = z.object({
  name: requiredName("Enter the supplier name."),
  type: z.enum(["fabric", "outsourcing"]),
  contactName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  trn: optionalTrn,
  city: optionalText,
  address: optionalText,
  paymentDays: optionalDays,
  notes: optionalText,
});

function readSupplier(fd: FormData) {
  return supplierSchema.safeParse({
    name: text(fd, "name"),
    type: text(fd, "type") || "fabric",
    contactName: text(fd, "contactName"),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    trn: text(fd, "trn"),
    city: text(fd, "city"),
    address: text(fd, "address"),
    paymentDays: text(fd, "paymentDays"),
    notes: text(fd, "notes"),
  });
}

export async function createSupplier(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = readSupplier(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const [row] = await db
    .insert(suppliers)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: suppliers.id });
  await logActivity({
    actor: me,
    entityType: "supplier",
    entityId: row.id,
    action: "created",
    summary: `${me.name} added supplier ${parsed.data.name}`,
  });
  revalidatePath("/purchases/suppliers");
  redirect(`/purchases/suppliers/${row.id}?added=1`);
}

export async function updateSupplier(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = readSupplier(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const existing = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
  if (!existing) return { message: "That supplier no longer exists." };
  await db.update(suppliers).set(parsed.data).where(eq(suppliers.id, id));
  await logActivity({
    actor: me,
    entityType: "supplier",
    entityId: id,
    action: "updated",
    summary: `${me.name} updated ${parsed.data.name}`,
    changes: parsed.data,
  });
  revalidatePath("/purchases/suppliers");
  revalidatePath(`/purchases/suppliers/${id}`);
  redirect(`/purchases/suppliers/${id}?saved=1`);
}

export async function setSupplierArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const archive = text(fd, "archive") === "true";
  const existing = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
  if (!existing) return { message: "That supplier no longer exists." };
  await db.update(suppliers).set({ deletedAt: archive ? new Date() : null }).where(eq(suppliers.id, id));
  await logActivity({
    actor: me,
    entityType: "supplier",
    entityId: id,
    action: "status_changed",
    summary: `${me.name} ${archive ? "archived" : "restored"} ${existing.name}`,
  });
  revalidatePath("/purchases/suppliers");
  revalidatePath(`/purchases/suppliers/${id}`);
  return { ok: true, savedAt: Date.now(), message: archive ? `${existing.name} archived.` : `${existing.name} restored.` };
}
