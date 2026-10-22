import { MoneyForm } from "@/components/forms/money-form";
import { requireOwner } from "@/lib/session";
import { requireSetupInProgress } from "@/lib/setup";
import { StepFrame } from "../_components/step-frame";

export default async function MoneyStep() {
  await requireOwner();
  const settings = await requireSetupInProgress();
  return (
    <StepFrame
      step="money"
      title="Where should customers pay you?"
      description="Bank details print at the bottom of every invoice. Credit days decide when a wholesale invoice is due. Both can wait if you are not sure yet."
    >
      <MoneyForm settings={settings} mode="setup" backHref="/setup/shop" />
    </StepFrame>
  );
}
