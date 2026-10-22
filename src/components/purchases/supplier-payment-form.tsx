"use client";

import { useActionState, useState } from "react";
import { recordSupplierPayment } from "@/actions/payables";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { MethodChips, filsInput, parseFils, type Method } from "@/components/money/form-bits";
import { DueChip } from "@/components/orders/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";

type Open = { id: string; label: string; dueDate: string; balanceFils: number };

function spread(amount: number, open: Open[]) {
  let left = amount;
  return Object.fromEntries(
    open.map((o) => {
      const a = Math.min(o.balanceFils, Math.max(0, left));
      left -= a;
      return [o.id, a ? filsInput(a) : ""];
    }),
  );
}

/** Money you paid a supplier, set against their bills oldest first. */
export function SupplierPaymentForm({ supplierId, open, focusBillId, cancelHref, today }: { supplierId: string; open: Open[]; focusBillId?: string | null; cancelHref: string; today: string }) {
  const [state, action] = useActionState(recordSupplierPayment, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const ordered = focusBillId ? [...open.filter((o) => o.id === focusBillId), ...open.filter((o) => o.id !== focusBillId)] : open;
  const start = focusBillId ? (open.find((o) => o.id === focusBillId)?.balanceFils ?? 0) : 0;
  const [amount, setAmount] = useState(start ? filsInput(start) : "");
  const [alloc, setAlloc] = useState<Record<string, string>>(spread(start, ordered));
  const [manual, setManual] = useState(false);
  const [method, setMethod] = useState<Method | "">("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const paid = parseFils(amount);
  const allocated = ordered.reduce((s, o) => s + parseFils(alloc[o.id] ?? ""), 0);
  const leftover = paid - allocated;
  const payload = JSON.stringify({
    supplierId,
    date,
    amount,
    method,
    reference,
    notes,
    allocations: ordered.map((o) => ({ billId: o.id, amount: alloc[o.id] ?? "" })).filter((a) => parseFils(a.amount) > 0),
  });

  return (
    <ActionForm action={action} className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-5">
        <FormMessage message={state.ok ? undefined : state.message} />
        <section className="flex flex-col gap-5 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount paid, AED</Label>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              placeholder="0.00"
              autoFocus={!start}
              onChange={(e) => {
                setAmount(e.target.value);
                if (!manual) setAlloc(spread(parseFils(e.target.value), ordered));
              }}
              aria-invalid={errors.amount ? true : undefined}
              className="tabular h-16 w-full max-w-xs rounded-[10px] border border-line bg-surface px-4 font-display text-3xl outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
            />
            {errors.amount ? <p className="text-[13px] font-medium text-brand-deep">{errors.amount[0]}</p> : null}
          </div>
          <MethodChips value={method} onChange={setMethod} error={errors.method?.[0]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payDate">Date paid</Label>
              <Input id="payDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {method && method !== "cash" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payRef">{method === "cheque" ? "Cheque number" : method === "card" ? "Card slip number" : "Transfer reference"}</Label>
                <Input id="payRef" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payNotes">Note</Label>
            <Textarea id="payNotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </section>
      </div>
      <div className="flex flex-col gap-3 lg:sticky lg:top-6">
        {ordered.length ? (
          <section className="rounded-[14px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">What it pays</h2>
              {manual ? (
                <button
                  type="button"
                  className="text-[13px] font-semibold text-brand hover:underline"
                  onClick={() => {
                    setManual(false);
                    setAlloc(spread(paid, ordered));
                  }}
                >
                  Oldest first
                </button>
              ) : (
                <span className="text-[12px] text-ink-muted">Oldest first</span>
              )}
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {ordered.map((o) => (
                <li key={o.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{o.label}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="tabular text-[12px] text-ink-muted">{formatFils(o.balanceFils)} due</span>
                      <DueChip date={o.dueDate} />
                    </div>
                  </div>
                  <input
                    inputMode="decimal"
                    aria-label={`Amount against ${o.label}`}
                    value={alloc[o.id] ?? ""}
                    placeholder="0.00"
                    onChange={(e) => {
                      setManual(true);
                      setAlloc((a) => ({ ...a, [o.id]: e.target.value }));
                    }}
                    className="tabular h-11 w-28 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20"
                  />
                </li>
              ))}
            </ul>
            {leftover !== 0 ? (
              <p className={leftover < 0 ? "mt-3 border-t border-line pt-3 text-[14px] font-semibold text-brand-deep" : "mt-3 border-t border-line pt-3 text-[14px] text-ink-muted"}>
                {leftover < 0 ? `${formatFils(-leftover)} more than you paid.` : `${formatFils(leftover)} kept as an advance with this supplier.`}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="rounded-[14px] border border-line bg-surface p-5">
            <h2 className="text-lg font-medium">No open bills</h2>
            <p className="mt-1 text-[15px] text-ink-muted">This is kept as an advance with the supplier until a bill comes.</p>
          </section>
        )}
        <SubmitButton size="lg" pendingText="Saving" disabled={paid <= 0 || leftover < 0}>
          {paid > 0 ? `Record ${formatFils(paid)} paid` : "Record payment"}
        </SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
