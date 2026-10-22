import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { expenseCategories } from "@/db/schema";

export function activeExpenseCategories() {
  return db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(isNull(expenseCategories.deletedAt)).orderBy(asc(expenseCategories.name));
}
