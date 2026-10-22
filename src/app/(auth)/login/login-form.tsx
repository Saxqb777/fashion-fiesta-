"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { FormMessage, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/forms";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action] = useActionState(loginAction, EMPTY_FORM_STATE);
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <FormMessage message={state.message} />
      <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="email" autoFocus required />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
      <SubmitButton size="lg" className="mt-2 w-full" pendingText="Signing in">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}
