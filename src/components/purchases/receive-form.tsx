"use client";

import { useActionState, useState } from "react";
import { receiveGoods } from "@/actions/purchases";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";

type Line = { id: string; description: string; unit: "m" | "pcs"; left: string; leftLabel: string; stock: boolean };

/** What arrived. Each line starts at what is still to come. */
export function ReceiveForm({ poId, lines, today, outsourcing }: { poId: string; lines: Line[]; today: string; outsourcing: boolean }) {
  const [state, action] = useActionState(receiveGoods, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, l.left])));
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const payload = JSON.stringify({ poId, date, notes, lines: lines.map((l) => ({ poLineId: l.id, qty: qty[l.id] ?? "" })) });
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={payload} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <label htmlFor={`r-${l.id}`} className="text-[15px] font-semibold">
                {l.description}
              </label>
              <p className="text-[13px] text-ink-muted">
                {l.leftLabel} still to come{l.stock ? ". Goes into fabric stock." : ""}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <input
                  id={`r-${l.id}`}
                  inputMode="decimal"
                  value={qty[l.id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                  aria-invalid={errors[`line.${l.id}`] ? true : undefined}
                  className="tabular h-11 w-24 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
                />
                <span className="w-12 text-[13px] text-ink-muted">{l.unit === "m" ? "metres" : "pieces"}</span>
              </div>
              {errors[`line.${l.id}`] ? <p className="text-[12px] font-medium text-brand-deep">{errors[`line.${l.id}`]![0]}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recDate">Date</Label>
          <Input id="recDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recNotes">Note</Label>
          <Textarea id="recNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. For example: their delivery note DN 5521." />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pendingText="Saving" data-mission="receive">
          {outsourcing ? "Record pieces back" : "Record what arrived"}
        </SubmitButton>
        <LinkButton href={`/purchases/orders/${poId}`} variant="ghost" size="lg">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
