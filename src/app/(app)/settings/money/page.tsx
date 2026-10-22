import { MoneyForm } from "@/components/forms/money-form";
import { getSettings } from "@/lib/settings";
import { SettingsSection } from "../settings-section";

export default async function MoneySettings() {
  const settings = await getSettings();
  return (
    <SettingsSection title="Bank and credit terms" description="Bank details print on invoices. Credit days set the due date for wholesale customers.">
      <MoneyForm settings={settings} mode="settings" />
    </SettingsSection>
  );
}
