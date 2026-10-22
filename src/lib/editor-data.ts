import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { fabrics, productCategories, products, suppliers, users } from "@/db/schema";
import { getMeasurementFields, getMeasurementTemplates } from "./measurements";
import { stockFor } from "./payables";
import { getSettings } from "./settings";

export async function editorLookups() {
  const [productRows, fabricRows, tailorRows, unitRows, fields, settings, templates] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        priceFils: products.priceFils,
        metresPerPieceCenti: products.metresPerPieceCenti,
        templateId: productCategories.measurementTemplateId,
      })
      .from(products)
      .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
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
    getMeasurementTemplates(),
  ]);
  const stock = await stockFor(fabricRows.map((f) => f.id));
  return {
    products: productRows,
    fabrics: fabricRows.map((f) => ({ ...f, stockCenti: stock.get(f.id) ?? 0 })),
    tailors: tailorRows,
    units: unitRows,
    fields: fields.map((f) => f.name),
    templates: templates.map((t) => ({ id: t.id, name: t.name, fields: t.fields })),
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
