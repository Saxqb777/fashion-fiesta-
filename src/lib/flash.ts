import { cookies } from "next/headers";
import type { FormState } from "./forms";

export const FLASH_COOKIE = "ff_flash";

/**
 * Success message that survives the form disappearing.
 * Approve, submit or mark ready often remove their own button when the page refreshes,
 * so the toast is shown by the layout instead of the form.
 */
export async function flashDone(message: string): Promise<FormState> {
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ m: message, t: Date.now() })), { path: "/", maxAge: 30, sameSite: "lax" });
  return { ok: true, savedAt: Date.now() };
}

export async function readFlash() {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { m: string; t: number };
    return typeof v.m === "string" ? v : null;
  } catch {
    return null;
  }
}
