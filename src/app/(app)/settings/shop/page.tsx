import { ShopForm } from "@/components/forms/shop-form";
import { getSettings } from "@/lib/settings";
import { SettingsSection } from "../settings-section";

export default async function ShopSettings() {
  const settings = await getSettings();
  return (
    <SettingsSection title="Shop details" description="Printed on quotes, invoices and receipts.">
      <ShopForm settings={settings} mode="settings" />
    </SettingsSection>
  );
}
