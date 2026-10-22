"use client";

import { useActionState } from "react";
import { saveEmailSettings } from "@/actions/email";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import type { EmailTemplate } from "@/lib/email";
import { EMPTY_FORM_STATE } from "@/lib/forms";

export function EmailSettingsForm({
  domain,
  fromName,
  tradeName,
  fromLocal,
  templates,
  docs,
  defaults,
}: {
  domain: string;
  fromName: string;
  tradeName: string;
  fromLocal: string;
  templates: Record<string, EmailTemplate>;
  docs: { type: string; label: string }[];
  defaults: EmailTemplate;
}) {
  const [state, action] = useActionState(saveEmailSettings, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <FormMessage message={state.ok ? undefined : state.message} />
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <h2 className="text-xl font-medium">Who it comes from</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField name="emailFromName" label="Sender name" defaultValue={fromName} placeholder={tradeName} hint="What the customer sees in their inbox." />
          <TextField name="emailFromLocal" label="Address" defaultValue={fromLocal} errors={e.emailFromLocal} hint={`Before @${domain}`} />
        </div>
      </section>
      <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
        <h2 className="text-xl font-medium">Words for each document</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Leave a box empty to use the standard words. You can use {"{name}"}, {"{title}"}, {"{details}"}, {"{shop}"} and {"{sender}"}. Every email can still be changed before it goes.
        </p>
        <div className="mt-5 flex flex-col divide-y divide-line">
          {docs.map((d) => (
            <details key={d.type} className="group py-3" open={Boolean(templates[d.type])}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-semibold">
                {d.label}
                <span className="text-[12px] font-medium text-ink-muted">{templates[d.type] ? "Your words" : "Standard words"}</span>
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <TextField name={`subject_${d.type}`} label="Subject" defaultValue={templates[d.type]?.subject ?? ""} placeholder={defaults.subject} />
                <TextAreaField name={`body_${d.type}`} label="Message" defaultValue={templates[d.type]?.body ?? ""} placeholder={defaults.body} rows={7} />
              </div>
            </details>
          ))}
        </div>
      </section>
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">Save email settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
