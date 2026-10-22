"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { saveMoney } from "@/actions/settings";
import { FormMessage, TextField } from "@/components/form/field";
import type { Settings } from "@/db/schema";
import { EMPTY_FORM_STATE, type FormMode } from "@/lib/forms";
import { FormActions } from "./form-actions";
import { useFormFeedback } from "./use-form-feedback";

export function MoneyForm({ settings, mode, backHref }: { settings: Settings; mode: FormMode; backHref?: string }) {
  const [state, action] = useActionState(saveMoney, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="bankName" label="Bank" defaultValue={settings.bankName ?? ""} errors={e.bankName} placeholder="ADCB, FAB, Mashreq" />
        <TextField name="accountName" label="Account name" defaultValue={settings.accountName ?? ""} errors={e.accountName} hint="Usually the legal name." />
      </div>
      <TextField name="iban" label="IBAN" defaultValue={settings.iban ?? ""} errors={e.iban} className="tabular uppercase" autoCapitalize="characters" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="accountNumber" label="Account number" inputMode="numeric" defaultValue={settings.accountNumber ?? ""} errors={e.accountNumber} className="tabular" />
        <TextField name="swift" label="SWIFT code" defaultValue={settings.swift ?? ""} errors={e.swift} className="uppercase" hint="Optional. For overseas payments." />
      </div>
      <div className="rounded-[14px] bg-paper-deep/60 p-4 sm:max-w-sm">
        <TextField
          name="defaultCreditDays"
          label="Default credit days"
          inputMode="numeric"
          defaultValue={String(settings.defaultCreditDays)}
          errors={e.defaultCreditDays}
          hint="Wholesale invoices fall due this many days after the invoice date. You can change it per customer later."
          className="tabular"
        />
      </div>
      <FormActions mode={mode} backHref={backHref} />
    </ActionForm>
  );
}
