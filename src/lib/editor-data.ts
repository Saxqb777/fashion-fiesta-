import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { fabrics, products, suppliers, users } from "@/db/schema";
import { getMeasurementFields } from "./measurements";
import { stockFor } from "./payables";
import { getSettings } from "./settings";

export async function editorLookups() {
  const [productRows, fabricRows, tailorRows, unitRows, fields, settings] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, priceFils: products.priceFils, metresPerPieceCenti: products.metresPerPieceCenti })
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.name)),
    db
      .select({ id: fabrics.id, name: fabrics.name, colour: fabrics.colour, shelfLocation: fabrics.shelfLocation })
      .from(fabrics)
      .where(isNull(fabrics.deletedAt))
      .orderBy(asc(fabrics.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.role, "tailor"), eq(users.isActive, true), isNull(users.deletedAt)))
      .orderBy(asc(users.name)),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.type, "outsourcing"), isNull(suppliers.deletedAt)))
      .orderBy(asc(suppliers.name)),
    getMeasurementFields(),
    getSettings(),
  ]);
  const stock = await stockFor(fabricRows.map((f) => f.id));
  return {
    products: productRows,
    fabrics: fabricRows.map((f) => ({ ...f, stockCenti: stock.get(f.id) ?? 0 })),
    tailors: tailorRows,
    units: unitRows,
    fields: fields.map((f) => f.name),
    vatRateBp: settings.vatRateBp,
    defaultCreditDays: settings.defaultCreditDays,
  };
}

/** Everyone who can hold a task, for names on cards. */
export async function assigneeNames() {
  const [u, s] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.type, "outsourcing")),
  ]);
  return new Map([...u, ...s].map((r) => [r.id, r.name]));
}
