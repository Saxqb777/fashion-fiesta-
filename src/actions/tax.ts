"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { settings, taxPeriods } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { formatISODate, todayISO } from "@/lib/dates";
import { text, type FormState } from "@/lib/forms";
import { pickVatPeriod } from "@/lib/report-registry";
import { getSettings } from "@/lib/settings";
import { requireOwner } from "@/lib/session";

const statusSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["not_started", "pack_ready", "filed"]),
  filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date you filed.").nullable().optional(),
  reference: z.string().trim().max(80).nullable().optional(),
});

/** Where a quarter is: Not started, Pack ready, or Filed on a date. */
export async function setTaxStatus(input: z.infer<typeof statusSchema>): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const s = parsed.data;
  const { periods } = await pickVatPeriod(s.periodStart);
  const period = periods.find((p) => p.start === s.periodStart);
  if (!period) return { error: "That quarter is not in the list." };
  if (s.status !== "not_started" && period.end >= todayISO()) return { error: "The quarter is still running. You can file once it has ended." };
  if (s.status === "filed" && !s.filedOn) return { error: "Pick the date you filed." };
  if (s.status === "filed" && (s.filedOn! <= period.end || s.filedOn! > todayISO())) return { error: "The filing date is after the quarter ends and not later than today." };
  const values = { status: s.status, filedOn: s.status === "filed" ? s.filedOn! : null, reference: s.status === "filed" ? s.reference || null : null };
  await db
    .insert(taxPeriods)
    .values({ periodStart: period.start, periodEnd: period.end, ...values, createdBy: me.id })
    .onConflictDoUpdate({ target: taxPeriods.periodStart, set: { ...values, updatedAt: new Date() } });
  const words = s.status === "filed" ? `filed on ${formatISODate(s.filedOn!, true)}` : s.status === "pack_ready" ? "pack ready" : "not started";
  await logActivity({ actor: me, entityType: "settings", action: "status_changed", summary: `${me.name} marked VAT ${period.label} ${words}` });
  revalidatePath("/reports/tax");
  return { ok: true };
}

/** Corporate tax registration number (corporate tax pack) and the trade licence (e-invoices). */
export async function saveCorporateTax(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const trn = text(fd, "ctTrn").replace(/\s+/g, "");
  if (trn && !/^\d{15}$/.test(trn)) return { errors: { ctTrn: ["15 digits, as on the registration certificate."] } };
  const license = text(fd, "tradeLicense").trim().slice(0, 40);
  const authority = text(fd, "tradeLicenseAuthority").trim().slice(0, 120);
  const current = await getSettings();
  await db.update(settings).set({ ctTrn: trn || null, tradeLicense: license || null, tradeLicenseAuthority: authority || null }).where(eq(settings.id, current.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} updated the tax details` });
  revalidatePath("/settings/money");
  revalidatePath("/reports/tax", "layout");
  return { ok: true, savedAt: Date.now(), message: "Tax details saved." };
}

/** "Check this quarter": runs the checks, has Claude word them, and keeps the result on the quarter. */
export async function checkQuarter(periodStart: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  const { periods } = await pickVatPeriod(periodStart);
  const period = periods.find((p) => p.start === periodStart);
  if (!period) return { error: "That quarter is not in the list." };
  const { reviewQuarter } = await import("@/lib/tax/review");
  const review = await reviewQuarter(period);
  await db
    .insert(taxPeriods)
    .values({ periodStart: period.start, periodEnd: period.end, status: "not_started", review, reviewedAt: new Date(), createdBy: me.id })
    .onConflictDoUpdate({ target: taxPeriods.periodStart, set: { review, reviewedAt: new Date(), updatedAt: new Date() } });
  revalidatePath("/reports/tax");
  return { ok: true };
}
