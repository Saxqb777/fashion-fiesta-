import { NumberingForm } from "@/components/forms/numbering-form";
import { requireOwner } from "@/lib/session";
import { getSequences } from "@/lib/settings";
import { requireSetupInProgress } from "@/lib/setup";
import { StepFrame } from "../_components/step-frame";

export default async function NumberingStep() {
  await requireOwner();
  await requireSetupInProgress();
  const sequences = await getSequences();
  return (
    <StepFrame
      step="numbering"
      title="How should documents be numbered?"
      description="Every quote, order, invoice and receipt gets a number from these. Keep the defaults or use your own prefixes."
    >
      <NumberingForm sequences={sequences} mode="setup" backHref="/setup/money" />
    </StepFrame>
  );
}
