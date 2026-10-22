import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import type { FormMode } from "@/lib/forms";

/** Setup: Back and Continue. Settings: Save changes. */
export function FormActions({
  mode,
  backHref,
  continueLabel = "Continue",
  saveLabel = "Save changes",
}: {
  mode: FormMode;
  backHref?: string;
  continueLabel?: string;
  saveLabel?: string;
}) {
  if (mode === "setup") {
    return (
      <div className="flex items-center justify-between gap-3 pt-2">
        {backHref ? (
          <Button variant="ghost" nativeButton={false} render={<Link href={backHref} />}>
            <ArrowLeftIcon />
            Back
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton size="lg" pendingText="Saving">
          {continueLabel}
        </SubmitButton>
      </div>
    );
  }
  return (
    <div className="flex justify-end pt-2">
      <SubmitButton pendingText="Saving">{saveLabel}</SubmitButton>
    </div>
  );
}
