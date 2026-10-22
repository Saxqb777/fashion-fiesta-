"use server";

import bcrypt from "bcryptjs";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { numberSequences, settings, users, type DocumentType } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { unstable_update } from "@/lib/auth";
import { DOCUMENT_TYPES, SETUP_STEPS, type SetupStep } from "@/lib/defaults";
import {
  emailSchema,
  fieldErrors,
  modeOf,
  optionalText,
  passwordSchema,
  text,
  type FormMode,
  type FormState,
} from "@/lib/forms";
import { requireOwner } from "@/lib/session";
import { getSequences, getSettings } from "@/lib/settings";
import { stepAfter } from "@/lib/setup";
import { LABEL_PRESETS } from "@/lib/label-layouts";

const saved = (message?: string): FormState => ({ ok: true, message, savedAt: Date.now() });

/** After a setup step is saved: remember progress and move on. Settings mode: refresh the page. */
async function finishStep(mode: FormMode, step: SetupStep, settingsPath: string) {
  if (mode === "setup") {
    const next = stepAfter(step);
    await db.update(settings).set({ setupStep: next });
    redirect(`/setup/${next}`);
  }
  revalidatePath(settingsPath);
  revalidatePath("/setup");
}

/* ---------- Account (setup step 1) ---------- */

const accountSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name."),
    email: emailSchema,
    phone: optionalText,
    password: z.string(),
    confirm: z.string(),
  })
  .refine((v) => v.password === "" || v.password.length >= 8, {
    message: "Use at least 8 characters.",
    path: ["password"],
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export async function saveAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = accountSchema.safeParse({
    name: text(fd, "name"),
    email: text(fd, "email"),
    phone: text(fd, "phone"),
    password: String(fd.get("password") ?? ""),
    confirm: String(fd.get("confirm") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { name, email, phone, password } = parsed.data;

  const clash = await db.query.users.findFirst({
    where: and(eq(users.email, email), isNull(users.deletedAt), ne(users.id, me.id)),
  });
  if (clash) return { errors: { email: ["Someone else already uses this email."] } };

  await db
    .update(users)
    .set({
      name,
      email,
      phone,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    })
    .where(eq(users.id, me.id));
  await unstable_update({ user: { name, email } });
  await logActivity({
    actor: me,
    entityType: "user",
    entityId: me.id,
    action: "updated",
    summary: `${name} updated their own account${password ? " and password" : ""}`,
  });
  await finishStep(modeOf(fd), "account", "/settings/team");
  return saved("Saved.");
}

/* ---------- Shop ---------- */

const shopSchema = z.object({
  tradeName: z.string().trim().min(2, "Enter the shop name."),
  legalName: z.string().trim().min(2, "Enter the legal name."),
  address: z.string().trim().min(4, "Enter the address."),
  trn: z.string().trim().regex(/^\d{15}$/, "A TRN has 15 digits."),
  phone: optionalText,
  email: z.union([z.literal(""), emailSchema]).transform((v) => (v ? v : null)),
  vatRate: z.coerce.number().min(0, "0 or more.").max(100, "100 or less."),
});

export async function saveShop(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = shopSchema.safeParse({
    tradeName: text(fd, "tradeName"),
    legalName: text(fd, "legalName"),
    address: text(fd, "address"),
    trn: text(fd, "trn").replace(/\s+/g, ""),
    phone: text(fd, "phone"),
    email: text(fd, "email"),
    vatRate: text(fd, "vatRate") || "0",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { vatRate, ...rest } = parsed.data;

  const current = await getSettings();
  await db
    .update(settings)
    .set({ ...rest, vatRateBp: Math.round(vatRate * 100) })
    .where(eq(settings.id, current.id));
  await logActivity({
    actor: me,
    entityType: "settings",
    entityId: current.id,
    action: "updated",
    summary: `${me.name} updated shop details`,
    changes: { ...rest, vatRate },
  });
  await finishStep(modeOf(fd), "shop", "/settings/shop");
  return saved("Shop details saved.");
}

/* ---------- Money ---------- */

const moneySchema = z.object({
  bankName: optionalText,
  accountName: optionalText,
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => v === "" || /^AE\d{21}$/.test(v), "A UAE IBAN starts with AE and has 23 characters.")
    .transform((v) => (v ? v : null)),
  accountNumber: optionalText,
  swift: optionalText,
  defaultCreditDays: z.coerce.number().int("Whole days only.").min(0, "0 or more.").max(365, "365 or less."),
});

export async function saveMoney(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = moneySchema.safeParse({
    bankName: text(fd, "bankName"),
    accountName: text(fd, "accountName"),
    iban: text(fd, "iban"),
    accountNumber: text(fd, "accountNumber"),
    swift: text(fd, "swift"),
    defaultCreditDays: text(fd, "defaultCreditDays") || "0",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const current = await getSettings();
  await db.update(settings).set(parsed.data).where(eq(settings.id, current.id));
  await logActivity({
    actor: me,
    entityType: "settings",
    entityId: current.id,
    action: "updated",
    summary: `${me.name} updated bank details and credit terms`,
    changes: { ...parsed.data, iban: parsed.data.iban ? "updated" : null },
  });
  await finishStep(modeOf(fd), "money", "/settings/money");
  return saved("Bank details saved.");
}

/* ---------- Numbering ---------- */

const prefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,12}$/, "Letters, numbers and dashes only. Up to 12 characters.");

export async function saveNumbering(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const current = await getSequences();
  const errors: Record<string, string[]> = {};
  const updates: { docType: DocumentType; prefix: string; nextNumber: number }[] = [];
  const seenPrefixes = new Set<string>();

  for (const doc of DOCUMENT_TYPES) {
    const row = current.find((r) => r.docType === doc.type);
    const prefix = prefixSchema.safeParse(text(fd, `prefix_${doc.type}`));
    const next = z.coerce.number().int().min(1).safeParse(text(fd, `next_${doc.type}`) || "1");
    if (!prefix.success) errors[`prefix_${doc.type}`] = [prefix.error.issues[0]?.message ?? "Invalid prefix."];
    else if (seenPrefixes.has(prefix.data)) errors[`prefix_${doc.type}`] = ["Each document needs its own prefix."];
    else seenPrefixes.add(prefix.data);
    if (!next.success) errors[`next_${doc.type}`] = ["Enter a whole number, 1 or more."];
    else if (row && next.data < row.nextNumber)
      errors[`next_${doc.type}`] = [`Numbers are never reused. The next number is already ${row.nextNumber}.`];
    if (prefix.success && next.success) updates.push({ docType: doc.type, prefix: prefix.data, nextNumber: next.data });
  }
  if (Object.keys(errors).length) return { errors };

  for (const u of updates) {
    await db
      .update(numberSequences)
      .set({ prefix: u.prefix, nextNumber: u.nextNumber })
      .where(eq(numberSequences.docType, u.docType));
  }
  await logActivity({
    actor: me,
    entityType: "number_sequences",
    action: "updated",
    summary: `${me.name} updated document numbering`,
    changes: Object.fromEntries(updates.map((u) => [u.docType, `${u.prefix} from ${u.nextNumber}`])),
  });
  await finishStep(modeOf(fd), "numbering", "/settings/numbering");
  return saved("Numbering saved.");
}

/* ---------- Embroidery operator ---------- */

const operatorSchema = z.object({
  embroideryOperatorName: optionalText,
  embroideryOperatorPhone: optionalText,
  embroideryShopSharePercent: z.coerce.number().int("Whole percent only.").min(0).max(100, "100 or less."),
});

export async function saveOperator(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = operatorSchema.safeParse({
    embroideryOperatorName: text(fd, "embroideryOperatorName"),
    embroideryOperatorPhone: text(fd, "embroideryOperatorPhone"),
    embroideryShopSharePercent: text(fd, "embroideryShopSharePercent") || "50",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const current = await getSettings();
  await db.update(settings).set(parsed.data).where(eq(settings.id, current.id));
  await logActivity({
    actor: me,
    entityType: "settings",
    entityId: current.id,
    action: "updated",
    summary: `${me.name} updated the embroidery operator`,
    changes: parsed.data,
  });
  revalidatePath("/settings/team");
  revalidatePath("/setup/team");
  return saved("Embroidery operator saved.");
}

/* ---------- People ---------- */

const personSchema = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  email: emailSchema,
  phone: optionalText,
  role: z.enum(["owner", "tailor"]),
});

export async function createPerson(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = personSchema
    .extend({ password: passwordSchema })
    .safeParse({
      name: text(fd, "name"),
      email: text(fd, "email"),
      phone: text(fd, "phone"),
      role: text(fd, "role") || "tailor",
      password: String(fd.get("password") ?? ""),
    });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { password, ...data } = parsed.data;

  const clash = await db.query.users.findFirst({ where: and(eq(users.email, data.email), isNull(users.deletedAt)) });
  if (clash) return { errors: { email: ["Someone already uses this email."] } };

  const [created] = await db
    .insert(users)
    .values({ ...data, passwordHash: await bcrypt.hash(password, 10), createdBy: me.id })
    .returning({ id: users.id });
  await logActivity({
    actor: me,
    entityType: "user",
    entityId: created.id,
    action: "created",
    summary: `${me.name} added ${data.name} as ${data.role}`,
  });
  revalidatePath("/settings/team");
  revalidatePath("/setup/team");
  return saved(`${data.name} added.`);
}

export async function updatePerson(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = personSchema.safeParse({
    name: text(fd, "name"),
    email: text(fd, "email"),
    phone: text(fd, "phone"),
    role: text(fd, "role") || "tailor",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const person = await db.query.users.findFirst({ where: and(eq(users.id, id), isNull(users.deletedAt)) });
  if (!person) return { message: "That person no longer exists." };

  if (person.role === "owner" && data.role !== "owner" && !(await anotherActiveOwner(person.id))) {
    return { errors: { role: ["The shop needs at least one owner."] } };
  }
  const clash = await db.query.users.findFirst({
    where: and(eq(users.email, data.email), isNull(users.deletedAt), ne(users.id, id)),
  });
  if (clash) return { errors: { email: ["Someone else already uses this email."] } };

  await db.update(users).set(data).where(eq(users.id, id));
  if (id === me.id) await unstable_update({ user: { name: data.name, email: data.email } });
  await logActivity({
    actor: me,
    entityType: "user",
    entityId: id,
    action: "updated",
    summary: `${me.name} updated ${data.name}`,
    changes: data,
  });
  revalidatePath("/settings/team");
  revalidatePath("/setup/team");
  return saved("Saved.");
}

export async function resetPersonPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] })
    .safeParse({ password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const person = await db.query.users.findFirst({ where: and(eq(users.id, id), isNull(users.deletedAt)) });
  if (!person) return { message: "That person no longer exists." };

  await db.update(users).set({ passwordHash: await bcrypt.hash(parsed.data.password, 10) }).where(eq(users.id, id));
  await logActivity({
    actor: me,
    entityType: "user",
    entityId: id,
    action: "updated",
    summary: `${me.name} set a new password for ${person.name}`,
  });
  return saved("New password set.");
}

export async function setPersonActive(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const id = text(fd, "id");
  const active = text(fd, "active") === "true";
  const person = await db.query.users.findFirst({ where: and(eq(users.id, id), isNull(users.deletedAt)) });
  if (!person) return { message: "That person no longer exists." };
  if (!active && id === me.id) return { message: "You cannot deactivate yourself." };
  if (!active && person.role === "owner" && !(await anotherActiveOwner(id))) {
    return { message: "The shop needs at least one active owner." };
  }
  await db.update(users).set({ isActive: active }).where(eq(users.id, id));
  await logActivity({
    actor: me,
    entityType: "user",
    entityId: id,
    action: "status_changed",
    summary: `${me.name} ${active ? "reactivated" : "deactivated"} ${person.name}`,
  });
  revalidatePath("/settings/team");
  revalidatePath("/setup/team");
  return saved(active ? `${person.name} can sign in again.` : `${person.name} can no longer sign in.`);
}

async function anotherActiveOwner(exceptId: string) {
  const other = await db.query.users.findFirst({
    where: and(eq(users.role, "owner"), eq(users.isActive, true), isNull(users.deletedAt), ne(users.id, exceptId)),
  });
  return Boolean(other);
}

/* ---------- Finish setup ---------- */

/** Team step done: on to opening balances. */
export async function goToOpening() {
  await requireOwner();
  await db.update(settings).set({ setupStep: "opening" });
  redirect("/setup/opening");
}

export async function completeSetup() {
  const me = await requireOwner();
  const current = await getSettings();
  if (!current.setupComplete) {
    await db
      .update(settings)
      .set({ setupComplete: true, setupStep: SETUP_STEPS[SETUP_STEPS.length - 1] })
      .where(eq(settings.id, current.id));
    await logActivity({
      actor: me,
      entityType: "settings",
      entityId: current.id,
      action: "setup_completed",
      summary: `${me.name} completed the shop setup`,
    });
  }
  revalidatePath("/", "layout");
  redirect("/setup/done");
}

/** Garment label sheet. Picks one of the known layouts; a thermal printer is one of them. */
export async function saveLabelLayout(index: number): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  const layout = LABEL_PRESETS[index];
  if (!layout) return { error: "Pick a label sheet." };
  const current = await getSettings();
  await db.update(settings).set({ labelLayout: layout }).where(eq(settings.id, current.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} set garment labels to ${layout.name}` });
  revalidatePath("/settings/shop");
  return { ok: true };
}

const quoteTermsSchema = z.object({
  days: z.coerce.number({ message: "Enter days, like 14." }).int("Whole days.").min(1, "At least 1 day.").max(365, "At most 365 days."),
  terms: z.string().trim().max(2000, "Keep the terms under 2000 characters."),
});

/** How long a new quote stays valid, and the terms printed on every quote. */
export async function saveQuoteTerms(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const parsed = quoteTermsSchema.safeParse({ days: text(fd, "quoteValidityDays"), terms: text(fd, "quoteTerms") });
  if (!parsed.success) {
    const e = parsed.error.flatten().fieldErrors;
    return { errors: { quoteValidityDays: e.days, quoteTerms: e.terms } };
  }
  const current = await getSettings();
  await db.update(settings).set({ quoteValidityDays: parsed.data.days, quoteTerms: parsed.data.terms || null }).where(eq(settings.id, current.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} updated quote terms, valid ${parsed.data.days} days` });
  revalidatePath("/settings/money");
  return { ok: true, savedAt: Date.now(), message: "Quote terms saved." };
}

/** The shop stamp image and whether it prints on Tax Invoice, Delivery Note and Credit Note. */
export async function saveStamp(input: { url: string; on: boolean }): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  const url = input.url.trim();
  if (url && !/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\/brand\//i.test(url)) return { error: "Upload the stamp again." };
  const current = await getSettings();
  await db
    .update(settings)
    .set({ stampUrl: url || null, stampOnDocuments: Boolean(url) && input.on })
    .where(eq(settings.id, current.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} ${url ? (input.on ? "set the stamp to print on documents" : "saved the stamp, not printing") : "removed the stamp"}` });
  revalidatePath("/settings/shop");
  return { ok: true };
}

/** The month the shop's VAT quarters start in, from the FTA certificate. Quarters run in threes from it. */
export async function saveVatPeriod(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const month = Number(text(fd, "vatPeriodStartMonth"));
  if (!Number.isInteger(month) || month < 1 || month > 12) return { errors: { vatPeriodStartMonth: ["Pick a month."] } };
  const current = await getSettings();
  await db.update(settings).set({ vatPeriodStartMonth: month }).where(eq(settings.id, current.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} set VAT quarters to start in month ${month}` });
  revalidatePath("/settings/money");
  revalidatePath("/reports/vat");
  return { ok: true, savedAt: Date.now(), message: "VAT period saved." };
}
