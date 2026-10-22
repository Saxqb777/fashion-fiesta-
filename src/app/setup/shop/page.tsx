import { ShopForm } from "@/components/forms/shop-form";
import { requireOwner } from "@/lib/session";
import { requireSetupInProgress } from "@/lib/setup";
import { StepFrame } from "../_components/step-frame";

export default async function ShopStep() {
  await requireOwner();
  const settings = await requireSetupInProgress();
  return (
    <StepFrame
      step="shop"
      title="Is this your shop?"
      description="We filled in what we know. Check it, correct it, and add the shop phone and email that should print on documents."
    >
      <ShopForm settings={settings} mode="setup" backHref="/setup/account" />
    </StepFrame>
  );
}
