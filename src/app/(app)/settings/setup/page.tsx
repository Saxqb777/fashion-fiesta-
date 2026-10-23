import { SetupList } from "@/components/guide/setup-list";
import { practiceAvailable } from "@/db";
import { setupSteps } from "@/lib/guide/setup";
import { isPractice } from "@/lib/practice";
import { requireOwner } from "@/lib/session";
import { SettingsSection } from "../settings-section";

export default async function SetupSettings() {
  const me = await requireOwner();
  if (isPractice()) {
    return (
      <SettingsSection title="Setup" description="Setup is for the real shop.">
        <p className="text-[15px] text-ink-muted">Switch back to Live to fill in the real shop details. Practice copies them the next time it is reset.</p>
      </SettingsSection>
    );
  }
  const steps = await setupSteps();
  const left = steps.filter((s) => !s.done).length;
  return (
    <SettingsSection
      title={left ? `Setup: ${left} of ${steps.length} left` : "Setup: all done"}
      description="What the shop needs so everything works. Skipped steps wait here. Each one ticks by itself once it is filled in."
    >
      <SetupList steps={steps} canLearn={!me.practiceOnly && practiceAvailable()} />
    </SettingsSection>
  );
}
