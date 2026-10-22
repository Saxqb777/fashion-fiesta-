import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { after } from "next/server";
import webpush from "web-push";
import { db } from "@/db";
import { notifications, pushSubscriptions, users } from "@/db/schema";

let configured: boolean | null = null;
function pushReady() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:owner@fashionfiesta.local", pub!, priv!);
  return configured;
}

type Note = { kind: string; title: string; body?: string | null; href?: string | null };

/** Sends to every device the people allowed. Dead subscriptions are removed. */
async function push(userIds: string[], note: Note) {
  if (!userIds.length || !pushReady()) return;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  const payload = JSON.stringify({ title: note.title, body: note.body ?? "", url: note.href ?? "/today", tag: note.kind });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      } catch (error) {
        const code = (error as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        else console.error("push failed", code);
      }
    }),
  );
}

/**
 * Something happened that someone should know. Saved for Today and pushed to their phones
 * after the response is sent, so the person tapping never waits for it.
 * "owners" means every active owner except the one who did it.
 */
export async function notify(to: "owners" | string[], note: Note, actorId?: string | null) {
  try {
    const ids =
      to === "owners"
        ? (
            await db
              .select({ id: users.id })
              .from(users)
              .where(and(eq(users.role, "owner"), eq(users.isActive, true), isNull(users.deletedAt), actorId ? ne(users.id, actorId) : undefined))
          ).map((u) => u.id)
        : to.filter((id) => id && id !== actorId);
    if (!ids.length) return;
    await db.insert(notifications).values(ids.map((userId) => ({ userId, kind: note.kind, title: note.title, body: note.body ?? null, href: note.href ?? null, createdBy: actorId ?? null })));
    after(() => push(ids, note));
  } catch (error) {
    // A notice must never break the action that caused it.
    console.error("notify failed", error);
  }
}
