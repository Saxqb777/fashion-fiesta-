"use client";

import { useActionState } from "react";
import { saveVatPeriod } from "@/actions/settings";
import { ActionForm } from "@/components/form/action-form";
import { SelectField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { EMPTY_FORM_STATE } from "@/lib/forms";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Quarters are three months long and start in the chosen month, so only the first three months are distinct. */
export function VatPeriodForm({ month }: { month: number }) {
  const [state, action] = useActionState(saveVatPeriod, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const quarter = (m: number) => [0, 3, 6, 9].map((k) => MONTHS[(m - 1 + k) % 12].slice(0, 3)).join(", ");
  return (
    <ActionForm action={action} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <SelectField
        name="vatPeriodStartMonth"
        label="First tax period starts in"
        defaultValue={String(((month - 1) % 3) + 1)}
        errors={state.errors?.vatPeriodStartMonth}
        className="sm:max-w-72"
        hint="Check the tax period on your FTA certificate."
      >
        {[1, 2, 3].map((m) => (
          <option key={m} value={m}>
            Quarters starting {quarter(m)}
          </option>
        ))}
      </SelectField>
      <div className="flex justify-end sm:pb-6">
        <SubmitButton pendingText="Saving">Save VAT period</SubmitButton>
      </div>
    </ActionForm>
  );
}
