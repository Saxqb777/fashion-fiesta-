"use client";

import { useActionState, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { saveSupplierBill } from "@/actions/payables";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TotalsBox } from "@/components/money/form-bits";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { lineAmountsCenti, parseCenti } from "@/lib/qty";
import { cn } from "cn";

type Supplier = { id: string; name: string; trn: string | null; paymentDays: number | null };
export type BillLineInput = { key: string; poLineId: string | null; description: string; unit: "m" | "pcs"; qty: string; unitPrice: string; hint?: string };

let seq = 0;
const key = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;
const toFils = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/** Their invoice, typed in. From a PO the lines come prefilled; without one, type anything. */
export function BillForm({
  suppliers,
  supplierId: fixedSupplier,
  po,
  lines: initialLines,
  vatRateBp,
  today,
  cancelHref,
}: {
  suppliers: Supplier[];
  supplierId?: string | null;
  po?: { id: string; number: string | null } | null;
  lines: BillLineInput[];
  vatRateBp: number;
  today: string;
  cancelHref: string;
}) {
  const [state, action] = useActionState(saveSupplierBill, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [supplierId, setSupplierId] = useState(fixedSupplier ?? "");
  const supplier = suppliers.find((s) => s.id === supplierId);
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [trn, setTrn] = useState(supplier?.trn ?? "");
  const [vat, setVat] = useState(Boolean(supplier?.trn));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<BillLineInput[]>(initialLines.length ? initialLines : [{ key: key(), poLineId: null, description: "", unit: "pcs", qty: "", unitPrice: "" }]);
  const update = (k: string, patch: Partial<BillLineInput>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const amounts = lines.map((l) => lineAmountsCenti(parseCenti(l.qty) ?? 0, toFils(l.unitPrice), vat ? vatRateBp : 0));
  const subtotal = amounts.reduce((s, a) => s + a.netFils, 0);
  const vatTotal = amounts.reduce((s, a) => s + a.vatFils, 0);
  const autoDue = (() => {
    const d = new Date(`${billDate || today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (supplier?.paymentDays ?? 0));
    return d.toISOString().slice(0, 10);
  })();

  const payload = JSON.stringify({
    supplierId,
    poId: po?.id ?? null,
    billNumber,
    billDate,
    dueDate,
    supplierTrn: trn,
    notes,
    vat,
    lines: lines.map((l) => ({ poLineId: l.poLineId, description: l.description, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice })),
  });

  return (
    <ActionForm action={action} className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-5">
        <FormMessage message={state.ok ? undefined : state.message} />
        <section className="grid gap-4 rounded-[14px] border border-line bg-surface p-4 sm:grid-cols-2 sm:p-6">
          {fixedSupplier ? null : (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="billSupplier">Supplier</Label>
              <select
                id="billSupplier"
                value={supplierId}
                onChange={(e) => {
                  const next = suppliers.find((s) => s.id === e.target.value);
                  setSupplierId(e.target.value);
                  setTrn(next?.trn ?? "");
                  setVat(Boolean(next?.trn));
                }}
                aria-invalid={errors.supplierId ? true : undefined}
                className="h-11 rounded-[10px] border border-line bg-surface px-3 text-base"
              >
                <option value="" disabled>
                  Pick a supplier
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {errors.supplierId ? <p className="text-[13px] font-medium text-brand-deep">{errors.supplierId[0]}</p> : null}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billNumber">Their invoice number</Label>
            <Input id="billNumber" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="As printed on their invoice" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billTrn">Their TRN</Label>
            <Input id="billTrn" value={trn} onChange={(e) => setTrn(e.target.value)} inputMode="numeric" className="tabular" aria-invalid={errors.supplierTrn ? true : undefined} placeholder="15 digits, from their invoice" />
            {errors.supplierTrn ? <p className="text-[13px] font-medium text-brand-deep">{errors.supplierTrn[0]}</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billDate">Invoice date</Label>
            <Input id="billDate" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billDue">Pay by</Label>
            <Input id="billDue" type="date" value={dueDate || autoDue} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-[12px] text-ink-muted">{supplier?.paymentDays ? `${supplier.paymentDays} days from the invoice date.` : "Same day, unless you change it."}</p>
          </div>
          <label className="flex items-center gap-2 text-[15px] sm:col-span-2">
            <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="size-5 accent-[#D7182A]" />
            Their invoice charges VAT {vatRateBp / 100}%
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-medium">Lines{po?.number ? ` from ${po.number}` : ""}</h2>
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
            {lines.map((l, i) => {
              const e = (f: string) => errors[`lines.${i}.${f}`]?.[0];
              return (
                <li key={l.key} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:px-5">
                  <div className="min-w-0 flex-1">
                    {l.poLineId ? (
                      <p className="text-[15px] font-semibold">{l.description}</p>
                    ) : (
                      <Input value={l.description} onChange={(ev) => update(l.key, { description: ev.target.value })} placeholder="What it is, for example Transport" aria-label="Line description" aria-invalid={e("description") ? true : undefined} />
                    )}
                    {l.hint ? <p className="text-[13px] text-ink-muted">{l.hint}</p> : null}
                    <p className="tabular mt-1 text-[13px] text-ink-muted">Line total {formatFils(amounts[i].totalFils)}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(ev) => update(l.key, { qty: ev.target.value.replace(/[^\d.]/g, "") })}
                          aria-label="Quantity"
                          aria-invalid={e("qty") ? true : undefined}
                          className="tabular h-11 w-20 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
                        />
                        <span className="w-6 text-[12px] text-ink-muted">{l.unit === "m" ? "m" : "pcs"}</span>
                      </div>
                      {e("qty") ? <p className="max-w-40 text-right text-[12px] font-medium text-brand-deep">{e("qty")}</p> : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <input
                        inputMode="decimal"
                        value={l.unitPrice}
                        placeholder="0.00"
                        onChange={(ev) => update(l.key, { unitPrice: ev.target.value.replace(/[^\d.]/g, "") })}
                        aria-label="Price before VAT"
                        className={cn(
                          "tabular h-11 w-28 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20",
                          !l.unitPrice && "border-brand",
                        )}
                      />
                      <span className="text-[11px] text-ink-muted">each, before VAT</span>
                    </div>
                    {l.poLineId ? null : (
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="outline" className="self-start" onClick={() => setLines((ls) => [...ls, { key: key(), poLineId: null, description: "", unit: "pcs", qty: "1", unitPrice: "" }])}>
            <PlusIcon />
            Add a line
          </Button>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billNotes">Note</Label>
            <Textarea id="billNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </section>
      </div>
      <div className="flex flex-col gap-3 lg:sticky lg:top-6">
        <TotalsBox rows={[["Subtotal", subtotal], ["VAT", vatTotal]]} strong={["Bill total", subtotal + vatTotal]} />
        <p className="text-[12px] text-ink-muted">Check this matches the total on their invoice.</p>
        <SubmitButton size="lg" pendingText="Saving" disabled={!supplierId || subtotal + vatTotal <= 0}>
          Save bill
        </SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
