import { resolveCname } from "node:dns/promises";

let cached: { at: number; base: string | null } | null = null;

/**
 * The shop's own address for links sent to customers, once its DNS points at Vercel.
 * Until then (or if the lookup fails) links keep using the address the owner is on.
 */
export async function publicBaseUrl(): Promise<string | null> {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!configured) return null;
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.base;
  let base: string | null = null;
  try {
    const host = new URL(configured).hostname;
    const targets = await resolveCname(host);
    if (targets.some((t) => /vercel-dns(-\d+)?\.com\.?$/i.test(t))) base = configured;
  } catch {
    base = null;
  }
  cached = { at: Date.now(), base };
  return base;
}
