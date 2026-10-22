import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLog, users } from "@/db/schema";
import type { ShareType } from "./share";

/** Which documents can be emailed, with the name used in subjects and the Settings list. */
export const EMAIL_DOC_LABEL: Record<ShareType, string> = {
  quote: "Quote",
  order: "Sales Order confirmation",
  delivery: "Delivery Note",
  invoice: "Tax Invoice",
  credit: "Credit Note",
  receipt: "Receipt",
  statement: "Statement of Account",
  po: "Purchase Order",
  pos: "Simplified Tax Invoice",
};

export type EmailTemplate = { subject: string; body: string };

/** Placeholders the owner can use in Settings: {name} {title} {details} {shop} {sender}. */
export const DEFAULT_TEMPLATE: EmailTemplate = {
  subject: "{title} from {shop}",
  body: "Dear {name},\n\n{details}\n\nThe PDF is attached. Reply to this email with any question.\n\nKind regards,\n{sender}\n{shop}",
};

export function templateFor(templates: Record<string, EmailTemplate> | null | undefined, type: ShareType): EmailTemplate {
  const t = templates?.[type];
  return { subject: t?.subject?.trim() || DEFAULT_TEMPLATE.subject, body: t?.body?.trim() || DEFAULT_TEMPLATE.body };
}

export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export const emailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_DOMAIN);

export const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** The last few emails sent about one document, newest first, with who sent them. */
export async function emailHistory(type: ShareType, id: string) {
  return db
    .select({ id: emailLog.id, to: emailLog.toEmail, status: emailLog.status, error: emailLog.error, at: emailLog.createdAt, by: users.name })
    .from(emailLog)
    .leftJoin(users, eq(users.id, emailLog.createdBy))
    .where(and(eq(emailLog.docType, type), eq(emailLog.docId, id)))
    .orderBy(desc(emailLog.createdAt))
    .limit(5);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain words in a quiet layout: the shop's red rule on top, then the message. */
function html(body: string, shop: string) {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#FAF7F2;padding:24px 12px;font-family:Manrope,Helvetica,Arial,sans-serif;color:#1F1A17;font-size:15px;line-height:1.55">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E1D9;border-radius:14px;overflow:hidden">
<div style="height:6px;background:#D7182A"></div>
<div style="padding:24px 24px 10px">${paras}</div>
<div style="padding:12px 24px 18px;border-top:1px solid #E8E1D9;color:#6F6560;font-size:12px">${escapeHtml(shop)}</div>
</div></body></html>`;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/** Sends through Resend from the shop's own domain. Replies go to the owner who sent it. */
export async function sendEmail(input: {
  fromName: string;
  fromLocal: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  body: string;
  shop: string;
  attachment?: { filename: string; content: Buffer };
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const domain = process.env.EMAIL_DOMAIN;
  if (!key || !domain) return { ok: false, error: "Email is not connected yet." };
  const from = `${input.fromName.replace(/[<>"]/g, "")} <${input.fromLocal}@${domain}>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        reply_to: input.replyTo ? [input.replyTo] : undefined,
        subject: input.subject,
        text: input.body,
        html: html(input.body, input.shop),
        attachments: input.attachment ? [{ filename: input.attachment.filename, content: input.attachment.content.toString("base64") }] : undefined,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      const msg = data.message ?? `Email service answered ${res.status}.`;
      return { ok: false, error: /domain/i.test(msg) && /verif/i.test(msg) ? "The shop's email domain is not verified yet. The DNS records still need to go live." : msg };
    }
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: "Could not reach the email service. Try again in a minute." };
  }
}

/** Domain status from Resend, for Settings. Null when email is not connected. */
export async function domainStatus(): Promise<{ status: string; records: { type: string; name: string; value: string; priority?: number; status: string }[] } | null> {
  const key = process.env.RESEND_API_KEY;
  const domain = process.env.EMAIL_DOMAIN;
  if (!key || !domain) return null;
  try {
    const list = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const all = ((await list.json()) as { data?: { id: string; name: string }[] }).data ?? [];
    const d = all.find((x) => x.name === domain);
    if (!d) return { status: "not_added", records: [] };
    const one = await fetch(`https://api.resend.com/domains/${d.id}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    const full = (await one.json()) as { status?: string; records?: { type: string; name: string; value: string; priority?: number; status: string }[] };
    return { status: full.status ?? "unknown", records: full.records ?? [] };
  } catch {
    return { status: "unreachable", records: [] };
  }
}
