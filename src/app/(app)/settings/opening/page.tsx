import { OpeningBalances } from "@/components/opening-balances";
import { SettingsSection } from "../settings-section";

export default function OpeningSettings() {
  return (
    <SettingsSection title="Opening balances" description="Where the shop stood on the day you started using the app.">
      <OpeningBalances />
    </SettingsSection>
  );
}
