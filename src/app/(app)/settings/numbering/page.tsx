import { NumberingForm } from "@/components/forms/numbering-form";
import { getSequences } from "@/lib/settings";
import { SettingsSection } from "../settings-section";

export default async function NumberingSettings() {
  const sequences = await getSequences();
  return (
    <SettingsSection title="Document numbering" description="Prefixes and the next number for each document.">
      <NumberingForm sequences={sequences} mode="settings" />
    </SettingsSection>
  );
}
