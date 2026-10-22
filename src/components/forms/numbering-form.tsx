"use client";

import { useActionState, useState } from "react";
import { saveNumbering } from "@/actions/settings";
import { FormMessage } from "@/components/form/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NumberSequence } from "@/db/schema";
import { DOCUMENT_TYPES } from "@/lib/defaults";
import { EMPTY_FORM_STATE, type FormMode } from "@/lib/forms";
import { cn } from "cn";
import { FormActions } from "./form-actions";
import { useFormFeedback } from "./use-form-feedback";

function Row({ label, row, errors }: { label: string; row: NumberSequence; errors: Record<string, string[] | undefined> }) {
  const [prefix, setPrefix] = useState(row.prefix);
  const [next, setNext] = useState(String(row.nextNumber));
  const prefixError = errors[`prefix_${row.docType}`]?.[0];
  const nextError = errors[`next_${row.docType}`]?.[0];
  const preview = `${prefix.toUpperCase() || "?"}-${String(Math.max(1, Number(next) || 1)).padStart(row.padding, "0")}`;
  return (
    <li className="grid gap-3 rounded-[14px] border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`prefix_${row.docType}`}>{label}</Label>
        <Input
          id={`prefix_${row.docType}`}
          name={`prefix_${row.docType}`}
          value={prefix}
          onChange={(ev) => setPrefix(ev.target.value.toUpperCase())}
          aria-invalid={prefixError ? true : undefined}
          autoCapitalize="characters"
          className="uppercase"
        />
        {prefixError ? <p className="text-[13px] font-medium text-brand-deep">{prefixError}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`next_${row.docType}`}>Next number</Label>
        <Input
          id={`next_${row.docType}`}
          name={`next_${row.docType}`}
          inputMode="numeric"
          value={next}
          onChange={(ev) => setNext(ev.target.value.replace(/\D/g, ""))}
          aria-invalid={nextError ? true : undefined}
          className="tabular"
        />
        {nextError ? <p className="text-[13px] font-medium text-brand-deep">{nextError}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink-muted">Next one will be</span>
        <span className={cn("tabular flex h-11 items-center font-display text-xl text-ink")}>{preview}</span>
      </div>
    </li>
  );
}

export function NumberingForm({
  sequences,
  mode,
  backHref,
}: {
  sequences: NumberSequence[];
  mode: FormMode;
  backHref?: string;
}) {
  const [state, action] = useActionState(saveNumbering, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const errors = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <ul className="flex flex-col gap-3">
        {DOCUMENT_TYPES.map((doc) => {
          const row = sequences.find((s) => s.docType === doc.type);
          return row ? <Row key={doc.type} label={doc.label} row={row} errors={errors} /> : null;
        })}
      </ul>
      <p className="text-[13px] text-ink-muted">Numbers are never reused. You can raise the next number, never lower it.</p>
      <FormActions mode={mode} backHref={backHref} />
    </form>
  );
}
