import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { productCategories } from "@/db/schema";
import { getMeasurementTemplates } from "@/lib/measurements";
import { SettingsSection } from "../settings-section";
import { CategoryList } from "./category-list";

export default async function CategoriesSettings() {
  const [categories, templates] = await Promise.all([
    db
      .select({ id: productCategories.id, name: productCategories.name, templateId: productCategories.measurementTemplateId })
      .from(productCategories)
      .where(isNull(productCategories.deletedAt))
      .orderBy(asc(productCategories.name)),
    getMeasurementTemplates(),
  ]);
  return (
    <SettingsSection title="Product categories" description="Group your products, for example School uniform, Spa wear, Abayas. Used to filter products and in reports. Pick how each one is measured so orders show only those measurements.">
      <CategoryList categories={categories} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
    </SettingsSection>
  );
}
