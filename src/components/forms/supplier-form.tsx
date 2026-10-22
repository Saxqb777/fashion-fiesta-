"use client";

import { ActionForm } from "@/components/form/action-form";
import Link from "next/link";
import { useActionState } from "react";
import { createSupplier, updateSupplier } from "@/actions/suppliers";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import type { Supplier } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { ChoiceGroup } from "./choice-group";

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const [state, action] = useActionState(supplier ? updateSupplier : createSupplier, EMPTY_FORM_STATE);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-6">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <FormMessage message={state.message} />
      <TextField name="name" label="Supplier name" defaultValue={supplier?.name ?? ""} errors={e.name} autoFocus={!supplier} />
      <ChoiceGroup
        name="type"
        label="What they do for you"
        defaultValue={supplier?.type ?? "fabric"}
        options={[
          { value: "fabric", label: "Sells fabric" },
          { value: "outsourcing", label: "Stitches for you" },
        ]}
        hint="Stitching units are the outside workshops, mostly in Ajman."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="contactName" label="Contact person" defaultValue={supplier?.contactName ?? ""} errors={e.contactName} />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={supplier?.phone ?? ""} errors={e.phone} />
        <TextField name="email" label="Email" type="email" inputMode="email" defaultValue={supplier?.email ?? ""} errors={e.email} />
        <TextField name="city" label="City" defaultValue={supplier?.city ?? ""} errors={e.city} placeholder="Ajman, Sharjah, Dubai" />
        <TextField name="trn" label="TRN" inputMode="numeric" defaultValue={supplier?.trn ?? ""} errors={e.trn} hint="Needed to claim VAT on their bills." className="tabular" />
        <TextField name="paymentDays" label="They give you, days" inputMode="numeric" defaultValue={supplier?.paymentDays?.toString() ?? ""} errors={e.paymentDays} hint="How long you have to pay them. Empty means cash." className="tabular" />
      </div>
      <TextAreaField name="address" label="Address" defaultValue={supplier?.address ?? ""} errors={e.address} />
      <TextAreaField name="notes" label="Notes" defaultValue={supplier?.notes ?? ""} errors={e.notes} />
      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button variant="ghost" nativeButton={false} render={<Link href={supplier ? `/purchases/suppliers/${supplier.id}` : "/purchases/suppliers"} />}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving">{supplier ? "Save changes" : "Add supplier"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
