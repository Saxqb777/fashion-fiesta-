"use client";

import { useActionState } from "react";
import { saveCorporateTax } from "@/actions/tax";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { EMPTY_FORM_STATE } from "@/lib/forms";

export function TaxIdsForm({ ctTrn, tradeLicense, authority }: { ctTrn: string | null; tradeLicense: string | null; authority: string | null }) {
  const [state, action] = useActionState(saveCorporateTax, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <FormMessage message={state.ok ? undefined : state.message} />
      <TextField name="ctTrn" label="Corporate tax registration number" defaultValue={ctTrn ?? ""} inputMode="numeric" errors={e.ctTrn} className="tabular max-w-72" hint="15 digits, from the corporate tax certificate. Prints on the corporate tax pack." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="tradeLicense" label="Trade licence number" defaultValue={tradeLicense ?? ""} errors={e.tradeLicense} className="tabular" hint="Needed on e-invoices." />
        <TextField name="tradeLicenseAuthority" label="Issued by" defaultValue={authority ?? ""} errors={e.tradeLicenseAuthority} placeholder="Abu Dhabi Department of Economic Development" />
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">Save tax details</SubmitButton>
      </div>
    </ActionForm>
  );
}
