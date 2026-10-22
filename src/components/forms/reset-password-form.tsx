"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { resetPersonPassword } from "@/actions/settings";
import { SubmitButton } from "@/components/form/submit-button";
import { FormMessage, TextField } from "@/components/form/field";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { useFormFeedback } from "./use-form-feedback";

export function ResetPasswordForm({ personId, onSaved }: { personId: string; onSaved?: () => void }) {
  const [state, action] = useActionState(resetPersonPassword, EMPTY_FORM_STATE);
  useFormFeedback(state, onSaved);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={personId} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <TextField name="password" label="New password" type="password" errors={e.password} autoComplete="new-password" hint="At least 8 characters." />
      <TextField name="confirm" label="Type it again" type="password" errors={e.confirm} autoComplete="new-password" />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">Set new password</SubmitButton>
      </div>
    </ActionForm>
  );
}
