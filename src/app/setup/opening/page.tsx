import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { completeSetup } from "@/actions/settings";
import { OpeningBalances } from "@/components/opening-balances";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { requireSetupInProgress } from "@/lib/setup";
import { StepFrame } from "../_components/step-frame";

export default async function OpeningStep() {
  await requireSetupInProgress();
  return (
    <StepFrame
      step="opening"
      title="Where do things stand today?"
      description="Cash in the drawer, who owes you and who you owe. Skip anything you do not know yet. You can fill it in later in Settings."
    >
      <OpeningBalances />
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">
        <Button variant="ghost" nativeButton={false} render={<Link href="/setup/team" />}>
          <ArrowLeftIcon />
          Back
        </Button>
        <form action={completeSetup}>
          <SubmitButton size="lg" pendingText="Finishing">
            Finish setup
          </SubmitButton>
        </form>
      </div>
    </StepFrame>
  );
}
