import { db } from "@/db";
import { activityLog } from "@/db/schema";

type Actor = { id?: string | null; name?: string | null } | null | undefined;

export async function logActivity(input: {
  actor?: Actor;
  entityType: string;
  entityId?: string | null;
  action: "created" | "updated" | "status_changed" | "signed_in" | "setup_completed";
  summary: string;
  changes?: Record<string, unknown>;
}) {
  try {
    await db.insert(activityLog).values({
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
      changes: input.changes,
    });
  } catch (error) {
    console.error("activity_log write failed", error);
  }
}
