import { activeCategories } from "@/lib/lookups";
import { SettingsSection } from "../settings-section";
import { CategoryList } from "./category-list";

export default async function CategoriesSettings() {
  const categories = await activeCategories();
  return (
    <SettingsSection title="Product categories" description="Group your products, for example School uniform, Spa wear, Abayas. Used to filter products and in reports.">
      <CategoryList categories={categories} />
    </SettingsSection>
  );
}
