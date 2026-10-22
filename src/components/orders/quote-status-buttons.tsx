"use client";

import { useActionState } from "react";
import { setQuoteStatus } from "@/actions/documents";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { EMPTY_FORM_STATE } from "@/lib/forms";

export function QuoteStatusButton({ id, status, label, variant = "ghost" }: { id: string; status: "draft" | "sent" | "declined"; label: string; variant?: "ghost" | "outline" }) {
  const [state, action] = useActionState(setQuoteStatus, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant} size="sm" pendingText="Saving">
        {label}
      </SubmitButton>
    </form>
  );
}
