"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { liveDb, practiceAvailable, practiceDb } from "@/db";
import { missionProgress, practiceEvents, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { unstable_update } from "@/lib/auth";
import { ensureOwnerInSandbox, ensureSandbox, isPractice, missionsFor } from "@/lib/practice";
import { OWNER_MISSIONS, TAILOR_MISSIONS, type MissionsState } from "@/lib/practice/missions-data";
import { buildSandbox } from "@/lib/practice/seed";
import { requireUser } from "@/lib/session";

/** Live or Practice, for an owner. The browser reloads after, so every screen reads the right shop. */
export async function switchMode(to: "live" | "practice"): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireUser();
  if (me.role !== "owner" || me.practiceOnly) return { error: "Only owners can switch." };
  if (to === "practice") {
    if (!practiceAvailable()) return { error: "Practice is not set up yet." };
    await ensureSandbox();
    await ensureOwnerInSandbox(me.id);
  }
  await liveDb.update(users).set({ practiceMode: to === "practice" }).where(eq(users.id, me.id));
  await unstable_update({ user: { practice: to === "practice" } });
  return { ok: true };
}

/** Rebuilds the sandbox from scratch and starts the missions again. */
export async function resetPractice(): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireUser();
  if (me.role !== "owner" || me.practiceOnly) return { error: "Only owners can reset Practice." };
  if (!practiceAvailable()) return { error: "Practice is not set up yet." };
  await buildSandbox();
  await ensureOwnerInSandbox(me.id);
  await logActivity({ actor: me, entityType: "settings", action: "updated", summary: `${me.name} reset Practice` });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** A tap the data cannot show by itself. Ignored outside Practice. */
export async function recordPracticeEvent(kind: string, ref?: string | null) {
  if (!isPractice()) return;
  const me = await requireUser();
  if (!/^[a-z-]{2,20}$/.test(kind)) return;
  await practiceDb().insert(practiceEvents).values({ userId: me.id, kind, ref: ref?.slice(0, 200) ?? null });
}

export async function missionState(): Promise<MissionsState | null> {
  if (!isPractice()) return null;
  const me = await requireUser();
  return missionsFor({ id: me.id, role: me.role });
}

export async function skipMission(key: string): Promise<MissionsState | null> {
  if (!isPractice()) return null;
  const me = await requireUser();
  const known = [...OWNER_MISSIONS, ...TAILOR_MISSIONS].some((m) => m.key === key) || key === "finish-seen";
  if (!known) return null;
  const p = practiceDb();
  const done = await p.query.missionProgress.findFirst({ where: and(eq(missionProgress.userId, me.id), eq(missionProgress.missionKey, key)) });
  if (!done) await p.insert(missionProgress).values({ userId: me.id, missionKey: key, status: key === "finish-seen" ? "done" : "skipped" });
  return missionsFor({ id: me.id, role: me.role });
}

/** Undo a skip: the mission comes back as the current one. */
export async function reopenMission(key: string): Promise<MissionsState | null> {
  if (!isPractice()) return null;
  const me = await requireUser();
  await practiceDb().delete(missionProgress).where(and(eq(missionProgress.userId, me.id), eq(missionProgress.missionKey, key), eq(missionProgress.status, "skipped")));
  return missionsFor({ id: me.id, role: me.role });
}
