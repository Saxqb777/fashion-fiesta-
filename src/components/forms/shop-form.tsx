"use client";

import { useActionState } from "react";
import { saveShop } from "@/actions/settings";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import type { Settings } from "@/db/schema";
import { EMPTY_FORM_STATE, type FormMode } from "@/lib/forms";
import { FormActions } from "./form-actions";
import { useFormFeedback } from "./use-form-feedback";

export function ShopForm({ settings, mode, backHref }: { settings: Settings; mode: FormMode; backHref?: string }) {
  const [state, action] = useActionState(saveShop, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="tradeName" label="Shop name" defaultValue={settings.tradeName} errors={e.tradeName} hint="What customers call you." />
        <TextField name="trn" label="TRN" inputMode="numeric" defaultValue={settings.trn} errors={e.trn} hint="Tax registration number, 15 digits." className="tabular" />
      </div>
      <TextField name="legalName" label="Legal name" defaultValue={settings.legalName} errors={e.legalName} hint="Printed on every tax invoice." />
      <TextAreaField name="address" label="Address" defaultValue={settings.address} errors={e.address} />
      <div className="grid gap-5 sm:grid-cols-3">
        <TextField name="phone" label="Shop phone" type="tel" inputMode="tel" defaultValue={settings.phone ?? ""} errors={e.phone} />
        <TextField name="email" label="Shop email" type="email" inputMode="email" defaultValue={settings.email ?? ""} errors={e.email} />
        <TextField name="vatRate" label="VAT rate %" inputMode="decimal" defaultValue={(settings.vatRateBp / 100).toString()} errors={e.vatRate} hint="UAE standard rate is 5." className="tabular" />
      </div>
      <FormActions mode={mode} backHref={backHref} />
    </form>
  );
}
