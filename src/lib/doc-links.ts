import { headers } from "next/headers";
import { publicBaseUrl } from "./public-url";
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

/** Everything the SendDoc buttons need for one document. */
export async function sendDocProps(type: ShareType, id: string, opts: { phone?: string | null; filename: string; message: string; query?: string }) {
  return { ...(await docLinks(type, id, opts.phone, opts.query)), filename: `${opts.filename.replace(/[^\w.-]+/g, "-")}.pdf`, message: opts.message };
}
