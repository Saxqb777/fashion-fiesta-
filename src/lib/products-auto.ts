import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { productCategories, products } from "@/db/schema";

async function uncategorisedId(actorId: string) {
  const existing = await db.query.productCategories.findFirst({
    where: and(sql`lower(${productCategories.name}) = 'uncategorised'`, isNull(productCategories.deletedAt)),
  });
  if (existing) return existing.id;
  const [row] = await db.insert(productCategories).values({ name: "Uncategorised", createdBy: actorId }).returning({ id: productCategories.id });
  return row.id;
}

/**
 * Free typed lines rule: a line never needs an existing product.
 * Returns the product id for a description, creating the product silently when the name is new.
 */
export async function resolveProduct(
  line: { productId?: string | null; description: string; unitPriceFils: number },
  actorId: string,
  cache: Map<string, string>,
) {
  const key = line.description.trim().toLowerCase();
  if (line.productId) {
    const p = await db.query.products.findFirst({ where: eq(products.id, line.productId) });
    if (p && p.name.trim().toLowerCase() === key) return { id: p.id, created: false };
  }
  if (cache.has(key)) return { id: cache.get(key)!, created: false };
  const match = await db.query.products.findFirst({
    where: and(sql`lower(trim(${products.name})) = ${key}`, isNull(products.deletedAt)),
  });
  if (match) {
    cache.set(key, match.id);
    return { id: match.id, created: false };
  }
  const [row] = await db
    .insert(products)
    .values({
      name: line.description.trim(),
      categoryId: await uncategorisedId(actorId),
      kind: "custom",
      priceFils: line.unitPriceFils,
      createdBy: actorId,
    })
    .returning({ id: products.id });
  cache.set(key, row.id);
  return { id: row.id, created: true };
}
