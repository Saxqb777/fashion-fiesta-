"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { saveOperator } from "@/actions/settings";
import { SubmitButton } from "@/components/form/submit-button";
import { FormMessage, TextField } from "@/components/form/field";
import type { Settings } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { useFormFeedback } from "./use-form-feedback";

export function OperatorForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState(saveOperator, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_0.8fr]">
        <TextField name="embroideryOperatorName" label="Operator name" defaultValue={settings.embroideryOperatorName ?? ""} errors={e.embroideryOperatorName} />
        <TextField name="embroideryOperatorPhone" label="Phone" type="tel" inputMode="tel" defaultValue={settings.embroideryOperatorPhone ?? ""} errors={e.embroideryOperatorPhone} />
        <TextField
          name="embroideryShopSharePercent"
          label="Shop share %"
          inputMode="numeric"
          defaultValue={String(settings.embroideryShopSharePercent)}
          errors={e.embroideryShopSharePercent}
          className="tabular"
        />
      </div>
      <p className="text-[13px] text-ink-muted">
        The shop keeps this share of every embroidery job. The operator keeps the rest. Works both ways: your customer or theirs.
      </p>
      <div className="flex justify-end">
        <SubmitButton variant="outline" pendingText="Saving">
          Save operator
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
