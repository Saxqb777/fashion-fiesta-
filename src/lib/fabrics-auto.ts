import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { fabrics } from "@/db/schema";

/**
 * Free typed lines on a PO: a new fabric name creates the fabric record silently.
 * Matches "Gabardine" and "Gabardine Navy" (name plus colour).
 */
export async function resolveFabric(
  line: { fabricId?: string | null; description: string; unitPriceFils: number; supplierId: string },
  actorId: string,
  cache: Map<string, string>,
) {
  const key = line.description.trim().toLowerCase();
  if (line.fabricId) return line.fabricId;
  if (cache.has(key)) return cache.get(key)!;
  const match = await db.query.fabrics.findFirst({
    where: and(
      sql`(lower(trim(${fabrics.name})) = ${key} or lower(trim(${fabrics.name} || ' ' || coalesce(${fabrics.colour}, ''))) = ${key} or lower(trim(${fabrics.name} || ', ' || coalesce(${fabrics.colour}, ''))) = ${key})`,
      isNull(fabrics.deletedAt),
    ),
  });
  if (match) {
    cache.set(key, match.id);
    return match.id;
  }
  const [row] = await db
    .insert(fabrics)
    .values({ name: line.description.trim(), costFils: line.unitPriceFils, supplierId: line.supplierId, createdBy: actorId })
    .returning({ id: fabrics.id });
  cache.set(key, row.id);
  return row.id;
}
