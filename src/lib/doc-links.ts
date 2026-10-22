import { headers } from "next/headers";
import { auth } from "./auth";
import { EMAIL_DOC_LABEL, emailHistory, emailReady, fillTemplate, templateFor } from "./email";
import { publicBaseUrl } from "./public-url";
import { getSettings } from "./settings";
import { shareToken, whatsappNumber, type ShareType } from "./share";

/** Owner PDF link, public share link for WhatsApp, and the customer's WhatsApp number. */
export async function docLinks(type: ShareType, id: string, phone?: string | null, query = "") {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return {
    pdfUrl: `/api/pdf/${type}/${id}${query}`,
    shareUrl: `${(await publicBaseUrl()) ?? `${proto}://${host}`}/d/${shareToken(type, id)}`,
    whatsapp: whatsappNumber(phone),
  };
}

export type MailProps = {
  type: ShareType;
  id: string;
  query: string;
  to: string;
  subject: string;
  body: string;
  ready: boolean;
  history: { id: string; to: string; status: string; error: string | null; at: string; by: string | null }[];
};

/** The Send by email draft: recipient, subject and words from the template in Settings. Owners only. */
async function mailProps(type: ShareType, id: string, opts: { email?: string | null; name?: string | null; title?: string; message: string; query?: string }): Promise<MailProps | null> {
  const session = await auth();
  if (session?.user?.role !== "owner") return null;
  const [s, history] = await Promise.all([getSettings(), emailHistory(type, id)]);
  const tpl = templateFor(s.emailTemplates, type);
  // The WhatsApp text starts with the shop name; an email already says who it is from.
  const plain = opts.message.startsWith(`${s.tradeName}: `) ? opts.message.slice(s.tradeName.length + 2) : opts.message;
  const details = plain.charAt(0).toUpperCase() + plain.slice(1);
  const vars = { name: opts.name || "Sir or Madam", title: opts.title ?? EMAIL_DOC_LABEL[type], details, shop: s.tradeName, sender: session.user.name ?? s.tradeName };
  return {
    type,
    id,
    query: opts.query ?? "",
    to: opts.email?.trim() ?? "",
    subject: fillTemplate(tpl.subject, vars),
    body: fillTemplate(tpl.body, vars),
    ready: emailReady(),
    history: history.map((h) => ({ ...h, at: h.at.toISOString() })),
  };
}

/** Everything the SendDoc buttons need for one document. */
export async function sendDocProps(
  type: ShareType,
  id: string,
  opts: { phone?: string | null; email?: string | null; name?: string | null; title?: string; filename: string; message: string; query?: string },
) {
  const [links, mail] = await Promise.all([docLinks(type, id, opts.phone, opts.query), mailProps(type, id, opts)]);
  return { ...links, filename: `${opts.filename.replace(/[^\w.-]+/g, "-")}.pdf`, message: opts.message, mail };
}
