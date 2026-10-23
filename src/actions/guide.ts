"use server";

import { eq } from "drizzle-orm";
import { liveDb } from "@/db";
import { users } from "@/db/schema";
import { requireOwner } from "@/lib/session";

/** The getting started sheet shows once per owner, whatever she chose on it. */
export async function markGuideSeen() {
  const me = await requireOwner();
  await liveDb.update(users).set({ guideSeenAt: new Date() }).where(eq(users.id, me.id));
}
