import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { taxPeriods } from "@/db/schema";
import type { VatPeriod } from "@/lib/reports";
import type { Review } from "./review";

export type PeriodState = { status: "not_started" | "pack_ready" | "filed"; filedOn: string | null; reference: string | null; review: Review | null; reviewedAt: Date | null };

const EMPTY: PeriodState = { status: "not_started", filedOn: null, reference: null, review: null, reviewedAt: null };

/** Each quarter's status. A quarter with no row is Not started. */
export async function periodStates(periods: VatPeriod[]): Promise<Map<string, PeriodState>> {
  const rows = periods.length ? await db.select().from(taxPeriods).where(inArray(taxPeriods.periodStart, periods.map((p) => p.start))) : [];
  const map = new Map<string, PeriodState>();
  for (const p of periods) {
    const r = rows.find((x) => x.periodStart === p.start);
    map.set(p.start, r ? { status: r.status, filedOn: r.filedOn, reference: r.reference, review: (r.review as Review | null) ?? null, reviewedAt: r.reviewedAt } : EMPTY);
  }
  return map;
}
