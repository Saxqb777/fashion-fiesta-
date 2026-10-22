import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { productCategories } from "@/db/schema";
import { getMeasurementTemplates } from "@/lib/measurements";
import { SettingsSection } from "../settings-section";
import { CategoryList } from "./category-list";
import { ExpenseCategoryList } from "./expense-category-list";
import { activeExpenseCategories } from "@/lib/expenses";

export default async function CategoriesSettings() {
  const [categories, templates, expenseCats] = await Promise.all([
    db
      .select({
        id: productCategories.id,
        name: productCategories.name,
        templateId: productCategories.measurementTemplateId,
      })
      .from(productCategories)
      .where(isNull(productCategories.deletedAt))
      .orderBy(asc(productCategories.name)),
    getMeasurementTemplates(),
    activeExpenseCategories(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection
        title="Product categories"
        description="Group your products, for example School uniform, Spa wear, Abayas. Used to filter products and in reports. Pick how each one is measured so orders show only those measurements."
      >
        <CategoryList
          categories={categories}
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        />
      </SettingsSection>
      <SettingsSection
        title="Expense categories"
        description="How expenses are grouped, for example Rent, Transport, Shop supplies. Salaries uses its own category."
      >
        <ExpenseCategoryList categories={expenseCats} />
      </SettingsSection>
    </div>
  );
}
