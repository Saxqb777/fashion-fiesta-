"use client";

import { useActionState, useState } from "react";
import { createCreditNote } from "@/actions/money";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { lineAmounts } from "@/lib/lines";
import { formatFils } from "@/lib/money";
import { QtyStepper, TotalsBox, parseQty } from "./form-bits";

type Line = { id: string; description: string; left: number; unitPriceFils: number; vatRateBp: number };

/** Credit pieces back against an issued Tax Invoice. Starts at zero: she picks what to credit. */
export function CreditForm({ invoiceId, lines, today }: { invoiceId: string; lines: Line[]; today: string }) {
  const [state, action] = useActionState(createCreditNote, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const amounts = lines.map((l) => lineAmounts(parseQty(qty[l.id] ?? ""), l.unitPriceFils, l.vatRateBp));
  const subtotal = amounts.reduce((s, a) => s + a.netFils, 0);
  const vat = amounts.reduce((s, a) => s + a.vatFils, 0);
  const payload = JSON.stringify({ invoiceId, date, reason, lines: lines.map((l) => ({ invoiceLineId: l.id, qty: parseQty(qty[l.id] ?? "") })) });

  return (
    <ActionForm action={action} className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-4">
        <FormMessage message={state.ok ? undefined : state.message} />
        <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
          {lines.map((l, i) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <label htmlFor={`c-${l.id}`} className="text-[15px] font-semibold">
                  {l.description}
                </label>
                <p className="tabular text-[13px] text-ink-muted">
                  {formatFils(l.unitPriceFils)} each{amounts[i].totalFils ? `. Credit ${formatFils(amounts[i].totalFils)} with VAT` : ""}
                </p>
              </div>
              {l.left > 0 ? (
                <QtyStepper id={`c-${l.id}`} value={qty[l.id] ?? ""} max={l.left} onChange={(v) => setQty((q) => ({ ...q, [l.id]: v }))} error={errors[`line.${l.id}`]?.[0]} />
              ) : (
                <span className="text-[13px] text-ink-muted">Fully credited</span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cnReason">Reason</Label>
          <Textarea id="cnReason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: 2 pieces returned, wrong size" aria-invalid={errors.reason ? true : undefined} />
          {errors.reason ? <p className="text-[13px] font-medium text-brand-deep">{errors.reason[0]}</p> : <p className="text-[13px] text-ink-muted">Prints on the credit note.</p>}
        </div>
        <div className="flex max-w-[200px] flex-col gap-1.5">
          <Label htmlFor="cnDate">Credit note date</Label>
          <Input id="cnDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-3 lg:sticky lg:top-6">
        <TotalsBox rows={[["Subtotal", subtotal], ["VAT", vat]]} strong={["Credit total", subtotal + vat]} />
        <SubmitButton size="lg" pendingText="Issuing" disabled={subtotal + vat <= 0}>
          Issue credit note
        </SubmitButton>
        <LinkButton href={`/money/invoices/${invoiceId}`} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
