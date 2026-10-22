import { ShopForm } from "@/components/forms/shop-form";
import { LabelLayoutPicker } from "@/components/settings/label-layout";
import { StampSettings } from "@/components/settings/stamp-settings";
import { DEFAULT_LABEL_LAYOUT } from "@/lib/label-layouts";
import { getSettings } from "@/lib/settings";
import { SettingsSection } from "../settings-section";

export default async function ShopSettings() {
  const settings = await getSettings();
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title="Shop details" description="Printed on quotes, invoices and receipts.">
        <ShopForm settings={settings} mode="settings" />
      </SettingsSection>
      <SettingsSection title="Shop stamp" description="Your stamp, printed in the Authorised signatory and stamp box. You still sign by hand.">
        <StampSettings url={settings.stampUrl} on={settings.stampOnDocuments} />
      </SettingsSection>
      <SettingsSection title="Garment labels" description="The sticker sheet you print order labels on. One label per piece: customer, branch, person, size and order number.">
        <LabelLayoutPicker current={(settings.labelLayout ?? DEFAULT_LABEL_LAYOUT).name} />
      </SettingsSection>
    </div>
  );
}
