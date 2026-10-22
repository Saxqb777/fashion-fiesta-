"use client";

import { useActionState } from "react";
import { saveAccount } from "@/actions/settings";
import { FormMessage, TextField } from "@/components/form/field";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { FormActions } from "./form-actions";
import { useFormFeedback } from "./use-form-feedback";

export function AccountForm({ user }: { user: { name: string; email: string; phone: string | null } }) {
  const [state, action] = useActionState(saveAccount, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value="setup" />
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label="Your name" defaultValue={user.name} errors={e.name} autoComplete="name" />
        <TextField name="phone" label="Your phone" type="tel" inputMode="tel" defaultValue={user.phone ?? ""} errors={e.phone} autoComplete="tel" />
      </div>
      <TextField name="email" label="Email for signing in" type="email" inputMode="email" defaultValue={user.email} errors={e.email} autoComplete="email" />
      <div className="grid gap-5 rounded-[14px] bg-paper-deep/60 p-4 sm:grid-cols-2">
        <TextField name="password" label="New password" type="password" errors={e.password} autoComplete="new-password" hint="Replace the starter password. At least 8 characters." />
        <TextField name="confirm" label="Type it again" type="password" errors={e.confirm} autoComplete="new-password" />
      </div>
      <FormActions mode="setup" />
    </form>
  );
}
