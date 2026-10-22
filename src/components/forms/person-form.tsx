"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { createPerson, updatePerson } from "@/actions/settings";
import { SubmitButton } from "@/components/form/submit-button";
import { FormMessage, SelectField, TextField } from "@/components/form/field";
import type { User } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { useFormFeedback } from "./use-form-feedback";

type Person = Pick<User, "id" | "name" | "email" | "phone" | "role">;

export function PersonForm({
  person,
  defaultRole = "tailor",
  onSaved,
  submitLabel,
  compact,
}: {
  person?: Person;
  defaultRole?: "owner" | "tailor";
  onSaved?: () => void;
  submitLabel?: string;
  compact?: boolean;
}) {
  const [state, action] = useActionState(person ? updatePerson : createPerson, EMPTY_FORM_STATE);
  useFormFeedback(state, onSaved);
  const e = state.errors ?? {};
  const formKey = state.savedAt ?? 0;

  return (
    <ActionForm key={formKey} action={action} className="flex flex-col gap-4">
      {person ? <input type="hidden" name="id" value={person.id} /> : null}
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className={compact ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        <TextField name="name" label="Name" defaultValue={person?.name ?? ""} errors={e.name} autoComplete="off" />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={person?.phone ?? ""} errors={e.phone} autoComplete="off" />
        <TextField
          name="email"
          label="Email for signing in"
          type="email"
          inputMode="email"
          defaultValue={person?.email ?? ""}
          errors={e.email}
          autoComplete="off"
        />
        <SelectField name="role" label="Role" defaultValue={person?.role ?? defaultRole} errors={e.role} hint="Tailors see their tasks and the POS. Owners see everything.">
          <option value="tailor">Tailor</option>
          <option value="owner">Owner</option>
        </SelectField>
        {!person ? (
          <TextField
            name="password"
            label="Password"
            type="password"
            errors={e.password}
            autoComplete="new-password"
            hint="At least 8 characters. They can use it on their phone straight away."
            className="sm:col-span-2"
          />
        ) : null}
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving" variant={compact ? "outline" : "default"}>
          {submitLabel ?? (person ? "Save changes" : "Add person")}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
