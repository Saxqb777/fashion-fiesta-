"use client";

import { useActionState, useState } from "react";
import { createDeliveryNote } from "@/actions/money";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { QtyStepper, parseQty } from "./form-bits";

type Line = { id: string; description: string; left: number };

/** What is going out today. Every line starts at what is left to deliver. */
export function DeliveryForm({ orderId, lines, today }: { orderId: string; lines: Line[]; today: string }) {
  const [state, action] = useActionState(createDeliveryNote, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, String(l.left)])));
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const pieces = lines.reduce((s, l) => s + parseQty(qty[l.id] ?? ""), 0);
  const payload = JSON.stringify({ orderId, date, notes, lines: lines.map((l) => ({ soLineId: l.id, qty: parseQty(qty[l.id] ?? "") })) });

  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={payload} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <label htmlFor={`q-${l.id}`} className="min-w-0 flex-1 text-[15px] font-semibold">
              {l.description}
            </label>
            <QtyStepper id={`q-${l.id}`} value={qty[l.id] ?? ""} max={l.left} onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))} error={errors[`line.${l.id}`]?.[0]} />
          </li>
        ))}
      </ul>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dnDate">Delivery date</Label>
          <Input id="dnDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dnNotes">Note on the delivery note</Label>
          <Textarea id="dnNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. For example: handed to reception." />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" pendingText="Making delivery note" disabled={!pieces} data-mission="make-dn">
          Make delivery note, {pieces} {pieces === 1 ? "piece" : "pieces"}
        </SubmitButton>
        <LinkButton href={`/orders/${orderId}`} variant="ghost" size="lg">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
