import { createHmac, timingSafeEqual } from "node:crypto";

export const SHARE_TYPES = ["quote", "order", "delivery", "invoice", "credit", "receipt", "statement", "po", "pos"] as const;
export type ShareType = (typeof SHARE_TYPES)[number];

function sign(payload: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(payload).digest("base64url").slice(0, 22);
}

/** A link the customer can open without logging in. Only works for this one document. */
export function shareToken(type: ShareType, id: string) {
  const payload = `${type}.${id}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readShareToken(token: string): { type: ShareType; id: string } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const expected = sign(payload);
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const [type, id] = payload.split(".");
  if (!SHARE_TYPES.includes(type as ShareType) || !/^[0-9a-f-]{36}$/.test(id ?? "")) return null;
  return { type: type as ShareType, id };
}

/** UAE numbers: 050 123 4567, +971 50..., 00971... all become 971501234567 for WhatsApp. */
export function whatsappNumber(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `971${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("5")) d = `971${d}`;
  return d.length >= 10 ? d : null;
}
