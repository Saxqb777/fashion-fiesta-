"use client";

import { useActionState } from "react";
import { saveQuoteTerms } from "@/actions/settings";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { EMPTY_FORM_STATE } from "@/lib/forms";

export function QuoteTermsForm({ days, terms }: { days: number; terms: string | null }) {
  const [state, action] = useActionState(saveQuoteTerms, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <FormMessage message={state.ok ? undefined : state.message} />
      <TextField name="quoteValidityDays" label="A quote is valid for, days" defaultValue={String(days)} inputMode="numeric" errors={e.quoteValidityDays} className="tabular max-w-40" hint="Sets the valid until date on a new quote. After that date it shows as expired." />
      <TextAreaField
        name="quoteTerms"
        label="Terms printed on every quote"
        defaultValue={terms ?? ""}
        errors={e.quoteTerms}
        rows={5}
        placeholder={"50% advance to confirm the order.\nDelivery 3 weeks after measurements and fabric approval.\nPrices include VAT."}
      />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">Save quote terms</SubmitButton>
      </div>
    </ActionForm>
  );
}
