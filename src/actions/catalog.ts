"use server";

import { and, eq, ilike, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { fabrics, productCategories, products } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { fieldErrors, moneySchema, optionalText, requiredName, text, type FormState } from "@/lib/forms";
import { requireOwner } from "@/lib/session";

const saved = (message: string): FormState => ({ ok: true, message, savedAt: Date.now() });

/* ---------- Categories ---------- */

export async function saveCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = requiredName("Enter a category name.").safeParse(text(fd, "name"));
  if (!parsed.success) return { errors: { name: [parsed.error.issues[0]?.message ?? "Enter a name."] } };
  const name = parsed.data;
  const clash = await db.query.productCategories.findFirst({
    where: and(ilike(productCategories.name, name), isNull(productCategories.deletedAt), id ? ne(productCategories.id, id) : undefined),
  });
  if (clash) return { errors: { name: ["That category already exists."] } };

  if (id) {
    await db.update(productCategories).set({ name }).where(eq(productCategories.id, id));
    await logActivity({ actor: me, entityType: "product_category", entityId: id, action: "updated", summary: `${me.name} renamed a category to ${name}` });
  } else {
    const [row] = await db.insert(productCategories).values({ name, createdBy: me.id }).returning({ id: productCategories.id });
    await logActivity({ actor: me, entityType: "product_category", entityId: row.id, action: "created", summary: `${me.name} added category ${name}` });
  }
  revalidatePath("/settings/categories");
  revalidatePath("/orders/products");
  return saved(id ? "Category renamed." : `${name} added.`);
}

export async function archiveCategory(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const cat = await db.query.productCategories.findFirst({ where: eq(productCategories.id, id) });
  if (!cat) return { message: "That category no longer exists." };
  await db.update(productCategories).set({ deletedAt: new Date() }).where(eq(productCategories.id, id));
  await logActivity({ actor: me, entityType: "product_category", entityId: id, action: "status_changed", summary: `${me.name} archived category ${cat.name}` });
  revalidatePath("/settings/categories");
  revalidatePath("/orders/products");
  return saved(`${cat.name} archived. Products in it keep their history.`);
}

/* ---------- Products ---------- */

const productSchema = z.object({
  name: requiredName("Enter the product name."),
  categoryId: z.string().trim().transform((v) => (v ? v : null)),
  kind: z.enum(["custom", "ready_made"]),
  priceFils: moneySchema,
  notes: optionalText,
});

export async function saveProduct(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = productSchema.safeParse({
    name: text(fd, "name"),
    categoryId: text(fd, "categoryId"),
    kind: text(fd, "kind") || "custom",
    priceFils: text(fd, "price"),
    notes: text(fd, "notes"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { errors: { ...errors, price: errors.priceFils } };
  }
  if (id) {
    await db.update(products).set(parsed.data).where(eq(products.id, id));
    await logActivity({ actor: me, entityType: "product", entityId: id, action: "updated", summary: `${me.name} updated product ${parsed.data.name}`, changes: parsed.data });
  } else {
    const [row] = await db.insert(products).values({ ...parsed.data, createdBy: me.id }).returning({ id: products.id });
    await logActivity({ actor: me, entityType: "product", entityId: row.id, action: "created", summary: `${me.name} added product ${parsed.data.name}` });
  }
  revalidatePath("/orders/products");
  return saved(id ? "Product saved." : `${parsed.data.name} added.`);
}

export async function setProductArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const archive = text(fd, "archive") === "true";
  const row = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!row) return { message: "That product no longer exists." };
  await db.update(products).set({ deletedAt: archive ? new Date() : null }).where(eq(products.id, id));
  await logActivity({ actor: me, entityType: "product", entityId: id, action: "status_changed", summary: `${me.name} ${archive ? "archived" : "restored"} product ${row.name}` });
  revalidatePath("/orders/products");
  return saved(archive ? `${row.name} archived.` : `${row.name} restored.`);
}

/* ---------- Fabrics ---------- */

const fabricSchema = z.object({
  name: requiredName("Enter the fabric name."),
  code: optionalText,
  colour: optionalText,
  supplierId: z.string().trim().transform((v) => (v ? v : null)),
  costFils: moneySchema,
  priceFils: moneySchema,
  photoUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || v.startsWith("https://"), "Upload the photo again.")
    .transform((v) => (v ? v : null)),
  shelfLocation: optionalText,
  notes: optionalText,
});

export async function saveFabric(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = fabricSchema.safeParse({
    name: text(fd, "name"),
    code: text(fd, "code"),
    colour: text(fd, "colour"),
    supplierId: text(fd, "supplierId"),
    costFils: text(fd, "cost"),
    priceFils: text(fd, "price"),
    photoUrl: text(fd, "photoUrl"),
    shelfLocation: text(fd, "shelfLocation"),
    notes: text(fd, "notes"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return { errors: { ...errors, cost: errors.costFils, price: errors.priceFils } };
  }
  if (id) {
    await db.update(fabrics).set(parsed.data).where(eq(fabrics.id, id));
    await logActivity({ actor: me, entityType: "fabric", entityId: id, action: "updated", summary: `${me.name} updated fabric ${parsed.data.name}`, changes: parsed.data });
  } else {
    const [row] = await db.insert(fabrics).values({ ...parsed.data, createdBy: me.id }).returning({ id: fabrics.id });
    await logActivity({ actor: me, entityType: "fabric", entityId: row.id, action: "created", summary: `${me.name} added fabric ${parsed.data.name}` });
  }
  revalidatePath("/purchases/fabrics");
  redirect(`/purchases/fabrics?${id ? "saved" : "added"}=1`);
}

export async function setFabricArchived(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const archive = text(fd, "archive") === "true";
  const row = await db.query.fabrics.findFirst({ where: eq(fabrics.id, id) });
  if (!row) return { message: "That fabric no longer exists." };
  await db.update(fabrics).set({ deletedAt: archive ? new Date() : null }).where(eq(fabrics.id, id));
  await logActivity({ actor: me, entityType: "fabric", entityId: id, action: "status_changed", summary: `${me.name} ${archive ? "archived" : "restored"} fabric ${row.name}` });
  revalidatePath("/purchases/fabrics");
  revalidatePath(`/purchases/fabrics/${id}`);
  return saved(archive ? `${row.name} archived.` : `${row.name} restored.`);
}
