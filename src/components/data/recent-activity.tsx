import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { TIME_ZONE } from "@/lib/defaults";
import { Panel } from "./detail";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** History for a record, plus its children (a customer and its branches). */
export async function RecentActivity({ entityId, relatedIds = [] }: { entityId: string; relatedIds?: string[] }) {
  const rows = await db.select().from(activityLog).where(inArray(activityLog.entityId, [entityId, ...relatedIds])).orderBy(desc(activityLog.createdAt)).limit(6);
  if (!rows.length) return null;
  return (
    <Panel title="History">
      <ol className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-3 text-sm">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line" />
            <div className="min-w-0">
              <p className="text-ink">{r.summary}</p>
              <p className="tabular text-[12px] text-ink-muted">{when.format(r.createdAt)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
