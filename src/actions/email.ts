"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { customers, emailLog, settings } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { addDaysISO, formatISODate, todayISO } from "@/lib/dates";
import { EMAIL_DOC_LABEL, EMAIL_RE, fillTemplate, sendEmail, templateFor, type EmailTemplate } from "@/lib/email";
import { text, type FormState } from "@/lib/forms";
import { agingByCustomer, statementLedger } from "@/lib/ledger";
import { formatFils } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { requireOwner } from "@/lib/session";
import { SHARE_TYPES, type ShareType } from "@/lib/share";
import { renderDoc } from "@/pdf/documents";

const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Send one document as a PDF attachment. She reviewed the address, subject and words first. */
export async function sendDocEmail(input: { type: string; id: string; query?: string; to: string; subject: string; body: string }): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireOwner();
  if (!SHARE_TYPES.includes(input.type as ShareType) || !/^[0-9a-f-]{36}$/.test(input.id)) return { error: "This document cannot be sent." };
  const type = input.type as ShareType;
  const to = input.to.trim();
  if (!EMAIL_RE.test(to)) return { error: "Enter one email address, like accounts@school.ae." };
  const subject = input.subject.trim().slice(0, 200);
  if (!subject) return { error: "Add a subject." };
  const body = input.body.trim().slice(0, 5000);
  const q = new URLSearchParams(input.query?.replace(/^\?/, "") ?? "");
  const doc = await renderDoc(type, input.id, { from: iso(q.get("from")), to: iso(q.get("to")) });
  if (!doc) return { error: "This document was not found." };
  const s = await getSettings();
  const filename = `${doc.filename.replace(/\.pdf$/i, "")}.pdf`;
  const res = await sendEmail({
    fromName: s.emailFromName || s.tradeName,
    fromLocal: s.emailFromLocal,
    to,
    replyTo: me.email,
    subject,
    body,
    shop: s.tradeName,
    attachment: { filename, content: doc.buffer },
  });
  await db.insert(emailLog).values({
    docType: type,
    docId: input.id,
    toEmail: to,
    subject,
    replyTo: me.email ?? null,
    filename,
    status: res.ok ? "sent" : "failed",
    providerId: res.ok ? res.id : null,
    error: res.ok ? null : res.error,
    createdBy: me.id,
  });
  if (!res.ok) return { error: res.error };
  await logActivity({ actor: me, entityType: type, entityId: input.id, action: "updated", summary: `${me.name} emailed ${EMAIL_DOC_LABEL[type]} to ${to}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Statements with a due reminder, to several customers at once from Who owes you.
 * One email each, a short pause between them so the email service keeps up.
 */
export async function sendStatements(customerIds: string[]): Promise<{ sent: number; failed: { name: string; error: string }[] }> {
  const me = await requireOwner();
  const ids = customerIds.filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 40);
  if (!ids.length) return { sent: 0, failed: [] };
  const [s, list] = await Promise.all([getSettings(), db.select().from(customers).where(and(inArray(customers.id, ids), isNull(customers.deletedAt)))]);
  const tpl = templateFor(s.emailTemplates, "statement");
  const end = todayISO();
  const start = addDaysISO(end, -90);
  const failed: { name: string; error: string }[] = [];
  let sent = 0;
  for (const c of list) {
    const to = c.email?.trim() ?? "";
    if (!EMAIL_RE.test(to)) {
      failed.push({ name: c.name, error: "No email address on the customer." });
      continue;
    }
    const [ledger, [aging], doc] = await Promise.all([statementLedger(c.id, start, end), agingByCustomer(c.id), renderDoc("statement", c.id, { from: start, to: end })]);
    if (!doc) {
      failed.push({ name: c.name, error: "Statement could not be made." });
      continue;
    }
    const late = aging ? aging.d1_30 + aging.d31_60 + aging.d61 : 0;
    const details = `Your statement of account to ${formatISODate(end, true)} is attached. ${
      ledger.closing > 0 ? `The balance is ${formatFils(ledger.closing)}${late > 0 ? `, of which ${formatFils(late)} is past its due date` : ""}. We would be grateful for payment at your earliest convenience.` : "Nothing is due. Thank you."
    }`;
    const vars = { name: c.name, title: EMAIL_DOC_LABEL.statement, details, shop: s.tradeName, sender: me.name ?? s.tradeName };
    const subject = fillTemplate(tpl.subject, vars);
    const body = fillTemplate(tpl.body, vars);
    const filename = `Statement-${c.name.replace(/[^\w.-]+/g, "-")}-${end}.pdf`;
    const res = await sendEmail({ fromName: s.emailFromName || s.tradeName, fromLocal: s.emailFromLocal, to, replyTo: me.email, subject, body, shop: s.tradeName, attachment: { filename, content: doc.buffer } });
    await db.insert(emailLog).values({ docType: "statement", docId: c.id, toEmail: to, subject, replyTo: me.email ?? null, filename, status: res.ok ? "sent" : "failed", providerId: res.ok ? res.id : null, error: res.ok ? null : res.error, createdBy: me.id });
    if (res.ok) sent += 1;
    else failed.push({ name: c.name, error: res.error });
    await new Promise((r) => setTimeout(r, 600));
  }
  if (sent) await logActivity({ actor: me, entityType: "customer", action: "updated", summary: `${me.name} emailed ${sent} ${sent === 1 ? "statement" : "statements"}` });
  revalidatePath("/money");
  return { sent, failed };
}

/** Who the email comes from, and the words for each document. Empty template fields fall back to the default. */
export async function saveEmailSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await requireOwner();
  const fromName = text(fd, "emailFromName").trim().slice(0, 80);
  const fromLocal = text(fd, "emailFromLocal").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,40}$/.test(fromLocal)) return { errors: { emailFromLocal: ["Letters, numbers and dots only, like orders."] } };
  const templates: Record<string, EmailTemplate> = {};
  for (const t of SHARE_TYPES) {
    const subject = text(fd, `subject_${t}`).trim().slice(0, 200);
    const body = text(fd, `body_${t}`).trim().slice(0, 5000);
    if (subject || body) templates[t] = { subject, body };
  }
  const current = await getSettings();
  await db.update(settings).set({ emailFromName: fromName || null, emailFromLocal: fromLocal, emailTemplates: templates }).where(eq(settings.id, current.id));
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} updated email settings` });
  revalidatePath("/settings/email");
  return { ok: true, savedAt: Date.now(), message: "Email settings saved." };
}
