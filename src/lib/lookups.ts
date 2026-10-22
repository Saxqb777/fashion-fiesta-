import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { productCategories, suppliers } from "@/db/schema";

export function fabricSuppliers() {
  return db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.type, "fabric"), isNull(suppliers.deletedAt)))
    .orderBy(asc(suppliers.name));
}

export function activeCategories() {
  return db
    .select({ id: productCategories.id, name: productCategories.name })
    .from(productCategories)
    .where(isNull(productCategories.deletedAt))
    .orderBy(asc(productCategories.name));
}
