"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState, useState } from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { archiveMeasurementField, saveMeasurementField } from "@/actions/measurements";
import { ArchiveButton } from "@/components/data/archive-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMPTY_FORM_STATE } from "@/lib/forms";

function FieldInput({ id, name, onDone }: { id?: string; name?: string; onDone?: () => void }) {
  const [state, action] = useActionState(saveMeasurementField, EMPTY_FORM_STATE);
  useFormFeedback(state, onDone);
  const error = state.errors?.name?.[0];
  return (
    <ActionForm key={id ? undefined : state.savedAt} action={action} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {id ? <input type="hidden" name="id" value={id} /> : null}
        <Input name="name" defaultValue={name ?? ""} placeholder="New measurement, for example Bicep" aria-label="Measurement name" aria-invalid={error ? true : undefined} autoFocus={Boolean(id)} />
        <SubmitButton pendingText="Saving" variant={id ? "default" : "outline"}>
          {id ? <CheckIcon /> : null}
          {id ? "Save" : "Add"}
        </SubmitButton>
        {id ? (
          <Button type="button" variant="ghost" size="icon" aria-label="Cancel" onClick={onDone}>
            <XIcon />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
    </ActionForm>
  );
}

export function FieldList({ fields }: { fields: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {fields.length ? (
        <ul className="flex flex-col gap-2">
          {fields.map((c) => (
            <li key={c.id} className="rounded-[14px] border border-line px-4 py-2.5">
              {editing === c.id ? (
                <FieldInput id={c.id} name={c.name} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[15px] font-semibold">{c.name}</p>
                  <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing(c.id)}>
                    <PencilIcon className="text-ink-muted" />
                  </Button>
                  <ArchiveButton action={archiveMeasurementField} id={c.id} archived={false} noun="measurement" />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No measurements yet. Add your first one below.</p>
      )}
      <FieldInput />
    </div>
  );
}
