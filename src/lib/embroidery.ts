import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { embroideryJobs, operatorSettlements, type EmbroideryJob } from "@/db/schema";

/**
 * The 50/50 split of one job, from the share fixed when the job was made.
 * Shop's customer: the operator earns his part. Operator's customer: he owes the shop its part.
 */
export function splitOf(job: Pick<EmbroideryJob, "side" | "priceFils" | "shopSharePercent">) {
  const shop = Math.round((job.priceFils * job.shopSharePercent) / 100);
  const operator = job.priceFils - shop;
  return { shop, operator, owedToOperator: job.side === "shop" ? operator : -shop };
}

/** Positive: the shop owes the operator. Negative: the operator owes the shop. Done jobs only. */
export async function operatorBalance() {
  const [jobs, [settled]] = await Promise.all([
    db
      .select({ side: embroideryJobs.side, priceFils: embroideryJobs.priceFils, shopSharePercent: embroideryJobs.shopSharePercent })
      .from(embroideryJobs)
      .where(eq(embroideryJobs.status, "done")),
    db
      .select({
        paid: sql<number>`coalesce(sum(case when ${operatorSettlements.direction} = 'to_operator' then ${operatorSettlements.amountFils} else 0 end), 0)::int`,
        received: sql<number>`coalesce(sum(case when ${operatorSettlements.direction} = 'from_operator' then ${operatorSettlements.amountFils} else 0 end), 0)::int`,
      })
      .from(operatorSettlements),
  ]);
  const earned = jobs.reduce((s, j) => s + splitOf(j).owedToOperator, 0);
  return earned - settled.paid + settled.received;
}
