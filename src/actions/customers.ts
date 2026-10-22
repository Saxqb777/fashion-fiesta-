"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { customerBranches, customers } from "@/db/schema";
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

const customerSchema = z.object({
  name: requiredName("Enter the customer name."),
  type: z.enum(["retail", "wholesale"]),
  tier: z.enum(["vip", "regular", "new"]),
  phone: optionalText,
  email: optionalEmail,
  trn: optionalTrn,
  address: optionalText,
  creditDays: optionalDays,
  /** Empty means no limit. */
  creditLimitFils: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter an amount like 5000 or leave it empty.")
    .transform((v) => (v === "" ? null : Math.round(Number(v) * 100))),
  notes: optionalText,
});

function readCustomer(fd: FormData) {
  return customerSchema.safeParse({
    name: text(fd, "name"),
    type: text(fd, "type") || "retail",
    tier: text(fd, "tier") || "new",
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    trn: text(fd, "trn"),
    address: text(fd, "address"),
    creditDays: text(fd, "creditDays"),
    creditLimitFils: text(fd, "creditLimit"),
    notes: text(fd, "notes"),
  });
}

export async function createCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = readCustomer(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const [row] = await db
    .insert(customers)
    .values({ ...parsed.data, createdBy: me.id })
    .returning({ id: customers.id });
  await logActivity({
    actor: me,
    entityType: "customer",
    entityId: row.id,
    action: "created",
    summary: `${me.name} added customer ${parsed.data.name}`,
  });
  revalidatePath("/customers");
  redirect(`/customers/${row.id}?added=1`);
}

export async function updateCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = readCustomer(fd);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const existing = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!existing) return { message: "That customer no longer exists." };
  await db.update(customers).set(parsed.data).where(eq(customers.id, id));
  await logActivity({
    actor: me,
    entityType: "customer",
    entityId: id,
    action: existing.tier !== parsed.data.tier ? "status_changed" : "updated",
    summary:
      existing.tier !== parsed.data.tier
        ? `${me.name} moved ${parsed.data.name} to ${parsed.data.tier.toUpperCase()}`
        : `${me.name} updated ${parsed.data.name}`,
    changes: parsed.data,
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?saved=1`);
}

export async function setCustomerArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const archive = text(fd, "archive") === "true";
  const existing = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!existing) return { message: "That customer no longer exists." };
  await db.update(customers).set({ deletedAt: archive ? new Date() : null }).where(eq(customers.id, id));
  await logActivity({
    actor: me,
    entityType: "customer",
    entityId: id,
    action: "status_changed",
    summary: `${me.name} ${archive ? "archived" : "restored"} ${existing.name}`,
  });
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { ok: true, savedAt: Date.now(), message: archive ? `${existing.name} archived.` : `${existing.name} restored.` };
}

/* ---------- Branches ---------- */

const branchSchema = z.object({
  name: requiredName("Enter the branch name."),
  contactName: optionalText,
  phone: optionalText,
  address: optionalText,
});

export async function saveBranch(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const customerId = text(fd, "customerId");
  const branchId = text(fd, "branchId");
  const parsed = branchSchema.safeParse({
    name: text(fd, "name"),
    contactName: text(fd, "contactName"),
    phone: text(fd, "phone"),
    address: text(fd, "address"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!customer) return { message: "That customer no longer exists." };

  if (branchId) {
    await db
      .update(customerBranches)
      .set(parsed.data)
      .where(and(eq(customerBranches.id, branchId), eq(customerBranches.customerId, customerId)));
    await logActivity({
      actor: me,
      entityType: "customer_branch",
      entityId: branchId,
      action: "updated",
      summary: `${me.name} updated branch ${parsed.data.name} of ${customer.name}`,
    });
  } else {
    const [row] = await db
      .insert(customerBranches)
      .values({ ...parsed.data, customerId, createdBy: me.id })
      .returning({ id: customerBranches.id });
    await logActivity({
      actor: me,
      entityType: "customer_branch",
      entityId: row.id,
      action: "created",
      summary: `${me.name} added branch ${parsed.data.name} to ${customer.name}`,
    });
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true, savedAt: Date.now(), message: branchId ? "Branch saved." : `${parsed.data.name} added.` };
}

export async function archiveBranch(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const branch = await db.query.customerBranches.findFirst({
    where: and(eq(customerBranches.id, id), isNull(customerBranches.deletedAt)),
  });
  if (!branch) return { message: "That branch no longer exists." };
  await db.update(customerBranches).set({ deletedAt: new Date() }).where(eq(customerBranches.id, id));
  await logActivity({
    actor: me,
    entityType: "customer_branch",
    entityId: id,
    action: "status_changed",
    summary: `${me.name} archived branch ${branch.name}`,
  });
  revalidatePath(`/customers/${branch.customerId}`);
  revalidatePath("/customers");
  return { ok: true, savedAt: Date.now(), message: `${branch.name} archived.` };
}
