"use client";

import { ActionForm } from "@/components/form/action-form";
import Link from "next/link";
import { useActionState } from "react";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { ChoiceGroup } from "./choice-group";

export function CustomerForm({ customer, defaultCreditDays }: { customer?: Customer; defaultCreditDays: number }) {
  const [state, action] = useActionState(customer ? updateCustomer : createCustomer, EMPTY_FORM_STATE);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-6">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <FormMessage message={state.message} />
      <TextField name="name" label="Customer name" defaultValue={customer?.name ?? ""} errors={e.name} autoFocus={!customer} hint="A person, or a school, spa or business." />
      <div className="grid gap-6 sm:grid-cols-2">
        <ChoiceGroup
          name="type"
          label="How they buy"
          defaultValue={customer?.type ?? "retail"}
          options={[
            { value: "retail", label: "Retail" },
            { value: "wholesale", label: "Wholesale" },
          ]}
          hint="Wholesale buys on credit and can have branches."
        />
        <ChoiceGroup
          name="tier"
          label="Tier"
          defaultValue={customer?.tier ?? "new"}
          options={[
            { value: "vip", label: "VIP", tone: "magenta" },
            { value: "regular", label: "Regular" },
            { value: "new", label: "New" },
          ]}
          hint="VIP customers sort first everywhere."
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={customer?.phone ?? ""} errors={e.phone} />
        <TextField name="email" label="Email" type="email" inputMode="email" defaultValue={customer?.email ?? ""} errors={e.email} />
        <TextField name="trn" label="TRN" inputMode="numeric" defaultValue={customer?.trn ?? ""} errors={e.trn} hint="Only if they are VAT registered. Prints on their invoices." className="tabular" />
        <TextField
          name="creditDays"
          label="Credit days"
          inputMode="numeric"
          defaultValue={customer?.creditDays?.toString() ?? ""}
          errors={e.creditDays}
          placeholder={`${defaultCreditDays}`}
          hint={`Leave empty to use the shop default of ${defaultCreditDays} days.`}
          className="tabular"
        />
      </div>
      <TextAreaField name="address" label="Address" defaultValue={customer?.address ?? ""} errors={e.address} />
      <TextAreaField name="notes" label="Notes" defaultValue={customer?.notes ?? ""} errors={e.notes} hint="Anything the team should know. Only owners see this." />
      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button variant="ghost" nativeButton={false} render={<Link href={customer ? `/customers/${customer.id}` : "/customers"} />}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving">{customer ? "Save changes" : "Add customer"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
