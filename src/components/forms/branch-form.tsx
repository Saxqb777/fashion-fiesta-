"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { saveBranch } from "@/actions/customers";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import type { CustomerBranch } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { useFormFeedback } from "./use-form-feedback";

export function BranchForm({ customerId, branch, onSaved }: { customerId: string; branch?: CustomerBranch; onSaved?: () => void }) {
  const [state, action] = useActionState(saveBranch, EMPTY_FORM_STATE);
  useFormFeedback(state, onSaved);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      {branch ? <input type="hidden" name="branchId" value={branch.id} /> : null}
      <FormMessage message={state.ok ? undefined : state.message} />
      <TextField name="name" label="Branch name" defaultValue={branch?.name ?? ""} errors={e.name} placeholder="Khalifa City campus" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="contactName" label="Contact person" defaultValue={branch?.contactName ?? ""} errors={e.contactName} />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={branch?.phone ?? ""} errors={e.phone} />
      </div>
      <TextAreaField name="address" label="Delivery address" defaultValue={branch?.address ?? ""} errors={e.address} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">{branch ? "Save branch" : "Add branch"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
