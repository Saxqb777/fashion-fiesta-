"use client";

import { useActionState, useRef } from "react";
import { addOpeningBalance, removeOpeningBalance, saveOpeningCash, saveSupplierOpening } from "@/actions/money";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { useFormFeedback } from "./use-form-feedback";

const filsInput = (fils: number) => (fils ? (fils / 100).toFixed(2) : "");

export function OpeningCashForm({ cashFils, date, today }: { cashFils: number; date: string | null; today: string }) {
  const [state, action] = useActionState(saveOpeningCash, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-4">
      <TextField name="cash" label="Cash in the drawer, AED" inputMode="decimal" defaultValue={filsInput(cashFils)} placeholder="0.00" errors={e.cash} className="tabular w-full sm:w-52" />
      <TextField name="date" label="Counted on" type="date" defaultValue={date ?? today} errors={e.date} className="w-full sm:w-44" />
      <SubmitButton pendingText="Saving">Save cash</SubmitButton>
    </ActionForm>
  );
}

export function AddCustomerOpeningForm({ customers, today }: { customers: { id: string; name: string }[]; today: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(addOpeningBalance, EMPTY_FORM_STATE);
  useFormFeedback(state, () => form.current?.reset());
  const e = state.errors ?? {};
  return (
    <ActionForm ref={form} action={action} className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
      <SelectField name="customerId" label="Customer" defaultValue="" errors={e.customerId}>
        <option value="" disabled>
          Pick a customer
        </option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <TextField name="amount" label="They owe, AED" inputMode="decimal" placeholder="0.00" errors={e.amount} className="tabular" />
      <TextField name="since" label="Owed since" type="date" defaultValue={today} errors={e.since} hint="Sets how late it is." />
      <SubmitButton pendingText="Adding">Add</SubmitButton>
      <FormMessage message={state.ok ? undefined : state.message} />
    </ActionForm>
  );
}

export function RemoveOpeningButton({ id }: { id: string }) {
  const [state, action] = useActionState(removeOpeningBalance, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <ActionForm action={action} className="flex flex-col items-end">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" pendingText="Removing">
        Remove
      </SubmitButton>
      {state.message && !state.ok ? <p className="text-[12px] text-brand-deep">{state.message}</p> : null}
    </ActionForm>
  );
}

export function SupplierOpeningForm({ suppliers, today }: { suppliers: { id: string; name: string }[]; today: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(saveSupplierOpening, EMPTY_FORM_STATE);
  useFormFeedback(state, () => form.current?.reset());
  const e = state.errors ?? {};
  return (
    <ActionForm ref={form} action={action} className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
      <SelectField name="supplierId" label="Supplier" defaultValue="" errors={e.supplierId}>
        <option value="" disabled>
          Pick a supplier
        </option>
        {suppliers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <TextField name="amount" label="You owe, AED" inputMode="decimal" placeholder="0.00" errors={e.amount} className="tabular" hint="0 clears it." />
      <TextField name="since" label="Owed since" type="date" defaultValue={today} errors={e.since} />
      <SubmitButton pendingText="Saving">Save</SubmitButton>
      <FormMessage message={state.ok ? undefined : state.message} />
    </ActionForm>
  );
}
