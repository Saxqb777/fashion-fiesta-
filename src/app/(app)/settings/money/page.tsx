import { MoneyForm } from "@/components/forms/money-form";
import { QuoteTermsForm } from "@/components/settings/quote-terms-form";
import { VatPeriodForm } from "@/components/settings/vat-period-form";
import { getSettings } from "@/lib/settings";
import { SettingsSection } from "../settings-section";

export default async function MoneySettings() {
  const settings = await getSettings();
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title="Bank and credit terms" description="Bank details print on invoices. Credit days set the due date for wholesale customers.">
        <MoneyForm settings={settings} mode="settings" />
      </SettingsSection>
      <SettingsSection title="Quote terms" description="How long a quote stays valid, and the terms printed at the bottom of every quote.">
        <QuoteTermsForm days={settings.quoteValidityDays} terms={settings.quoteTerms} />
      </SettingsSection>
      <SettingsSection title="VAT period" description="The quarters your VAT return covers. Reports, VAT uses them.">
        <VatPeriodForm month={settings.vatPeriodStartMonth} />
      </SettingsSection>
    </div>
  );
}
