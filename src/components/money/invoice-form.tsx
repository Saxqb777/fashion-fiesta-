"use client";

import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { createInvoice } from "@/actions/money";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatISODate } from "@/lib/dates";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { lineAmounts } from "@/lib/lines";
import { formatFils } from "@/lib/money";
import { QtyStepper, TotalsBox, filsInput, parseFils, parseQty } from "./form-bits";

type OrderLine = { soLineId: string; productId: string | null; description: string; left: number; unitPriceFils: number };
type Row = { key: string; soLineId: string | null; productId: string | null; description: string; left: number | null; qty: string; unitPrice: string };

let n = 0;
const blank = (): Row => ({ key: `x${++n}`, soLineId: null, productId: null, description: "", left: null, qty: "1", unitPrice: "" });

/**
 * Tax Invoice from an order. Lines start at what is left to invoice. Prices stay editable,
 * and extra lines can be typed in freely (delivery charge, alteration).
 */
export function InvoiceForm({
  orderId,
  lines,
  depositFils,
  creditFils,
  vatRateBp,
  today,
  dueDays,
  hasSplits = false,
}: {
  orderId: string;
  lines: OrderLine[];
  depositFils: number;
  creditFils: number;
  vatRateBp: number;
  today: string;
  dueDays: number;
  /** The order has lines split per branch, so a per branch breakdown can be printed. */
  hasSplits?: boolean;
}) {
  const [state, action] = useActionState(createInvoice, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [rows, setRows] = useState<Row[]>(
    lines.map((l) => ({ key: l.soLineId, soLineId: l.soLineId, productId: l.productId, description: l.description, left: l.left, qty: String(l.left), unitPrice: filsInput(l.unitPriceFils) })),
  );
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [breakdown, setBreakdown] = useState(false);
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const amounts = rows.map((r) => lineAmounts(parseQty(r.qty), parseFils(r.unitPrice), vatRateBp));
  const subtotal = amounts.reduce((s, a) => s + a.netFils, 0);
  const vat = amounts.reduce((s, a) => s + a.vatFils, 0);
  const total = subtotal + vat;
  const advance = Math.min(depositFils, total);
  const fromCredit = Math.min(creditFils, total - advance);
  const due = new Date(`${date || today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + dueDays);
  const dueIso = due.toISOString().slice(0, 10);

  const payload = JSON.stringify({
    orderId,
    date,
    notes,
    branchBreakdown: hasSplits && breakdown,
    lines: rows.map((r) => ({ soLineId: r.soLineId, productId: r.productId, description: r.description, qty: parseQty(r.qty), unitPrice: r.unitPrice })),
  });

  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <input type="hidden" name="payload" value={payload} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {rows.map((r, i) => {
              const e = (f: string) => errors[`lines.${i}.${f}`]?.[0];
              return (
                <li key={r.key} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:px-5">
                  <div className="min-w-0 flex-1">
                    {r.soLineId ? (
                      <label htmlFor={`q-${r.key}`} className="text-[15px] font-semibold">
                        {r.description}
                      </label>
                    ) : (
                      <Input value={r.description} onChange={(ev) => update(r.key, { description: ev.target.value, productId: null })} placeholder="What is it, for example Delivery charge" aria-label="Line description" aria-invalid={e("description") ? true : undefined} />
                    )}
                    {e("description") ? <p className="mt-1 text-[12px] font-medium text-brand-deep">{e("description")}</p> : null}
                    <p className="tabular mt-1 text-[13px] text-ink-muted">Line total {formatFils(amounts[i].totalFils)} with VAT</p>
                  </div>
                  <div className="flex items-start gap-2">
                    {r.left !== null ? (
                      <QtyStepper id={`q-${r.key}`} value={r.qty} max={r.left} onChange={(v) => update(r.key, { qty: v })} error={e("qty")} />
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <input
                          inputMode="numeric"
                          value={r.qty}
                          onChange={(ev) => update(r.key, { qty: ev.target.value.replace(/[^\d]/g, "") })}
                          aria-label="Quantity"
                          className="tabular h-11 w-20 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20"
                        />
                        {e("qty") ? <p className="text-[12px] font-medium text-brand-deep">{e("qty")}</p> : null}
                      </div>
                    )}
                    <div className="flex flex-col items-end gap-1">
                      <input
                        inputMode="decimal"
                        value={r.unitPrice}
                        onChange={(ev) => update(r.key, { unitPrice: ev.target.value })}
                        aria-label="Unit price before VAT"
                        placeholder="0.00"
                        className="tabular h-11 w-28 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20"
                      />
                      <span className="text-[11px] text-ink-muted">each, before VAT</span>
                      {e("unitPrice") ? <p className="text-[12px] font-medium text-brand-deep">{e("unitPrice")}</p> : null}
                    </div>
                    {r.soLineId ? null : (
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="outline" className="self-start" onClick={() => setRows((rs) => [...rs, blank()])}>
            <PlusIcon />
            Add a line
          </Button>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invDate">Invoice date</Label>
              <Input id="invDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <p className="text-[13px] text-ink-muted">Due {formatISODate(dueIso, true)}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invNotes">Note on the invoice</Label>
              <Textarea id="invNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {hasSplits ? (
            <label className="flex items-start gap-3 rounded-[14px] border border-line bg-surface px-4 py-3">
              <input type="checkbox" checked={breakdown} onChange={(e) => setBreakdown(e.target.checked)} className="mt-0.5 size-5 accent-[#D7182A]" />
              <span>
                <span className="block text-[15px] font-semibold">Show quantities per branch</span>
                <span className="text-[13px] text-ink-muted">Adds a section under the lines listing each branch and what it received. Totals stay the same.</span>
              </span>
            </label>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 lg:sticky lg:top-6">
          <TotalsBox
            rows={[
              ["Subtotal", subtotal],
              ["VAT", vat],
              ["Total", total],
              ...(advance > 0 ? ([["Paid in advance", -advance, "text-[#4d7a12]"]] as [string, number, string][]) : []),
              ...(fromCredit > 0 ? ([["Credit on account", -fromCredit, "text-[#4d7a12]"]] as [string, number, string][]) : []),
            ]}
            strong={["Balance due", total - advance - fromCredit]}
          />
          {advance > 0 ? <p className="text-[13px] text-ink-muted">The deposit on this order is applied to this invoice and printed as paid in advance.</p> : null}
          {fromCredit > 0 ? <p className="text-[13px] text-ink-muted">Money they paid earlier with nothing to pay at the time is used here first.</p> : null}
          <SubmitButton size="lg" pendingText="Issuing" disabled={total <= 0} data-mission="make-invoice">
            Issue Tax Invoice
          </SubmitButton>
          <p className="text-[12px] text-ink-muted">Once issued it cannot be edited. Corrections are made with a credit note.</p>
          <LinkButton href={`/orders/${orderId}`} variant="ghost">
            Cancel
          </LinkButton>
        </div>
      </div>
    </ActionForm>
  );
}
