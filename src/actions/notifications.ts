"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { notifications, pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/session";

const subSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }) });

/** This phone or computer wants push notices for the signed in person. */
export async function savePushSubscription(input: unknown, userAgent?: string): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireUser();
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return { error: "This browser did not give a valid subscription." };
  const s = parsed.data;
  await db
    .insert(pushSubscriptions)
    .values({ userId: me.id!, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null, createdBy: me.id })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: me.id!, p256dh: s.keys.p256dh, auth: s.keys.auth } });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok?: boolean }> {
  const me = await requireUser();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, me.id!)));
  return { ok: true };
}

export async function markAllRead(): Promise<{ ok?: boolean }> {
  const me = await requireUser();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me.id!), isNull(notifications.readAt)));
  revalidatePath("/today");
  return { ok: true };
}

/** Opening a notice marks it read. */
export async function markRead(id: string): Promise<{ ok?: boolean }> {
  const me = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, me.id!)));
  return { ok: true };
}
