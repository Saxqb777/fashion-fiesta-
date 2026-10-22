"use client";

import { useActionState, useState } from "react";
import { recordPayment } from "@/actions/money";
import { DueChip } from "@/components/orders/bits";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { MethodChips, filsInput, parseFils, type Method } from "./form-bits";

type Open = { id: string; label: string; dueDate: string; balanceFils: number };

/** Oldest due first until the money runs out. */
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

export function PaymentForm({
  customerId,
  open,
  orderId,
  deposit,
  defaultAmountFils,
  focusInvoiceId,
  cancelHref,
  today,
}: {
  customerId: string;
  open: Open[];
  orderId?: string | null;
  deposit: boolean;
  defaultAmountFils: number;
  focusInvoiceId?: string | null;
  cancelHref: string;
  today: string;
}) {
  const [state, action] = useActionState(recordPayment, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  // When she came from one invoice, that invoice goes first.
  const ordered = focusInvoiceId ? [...open.filter((o) => o.id === focusInvoiceId), ...open.filter((o) => o.id !== focusInvoiceId)] : open;
  const [amount, setAmount] = useState(defaultAmountFils ? filsInput(defaultAmountFils) : "");
  const [alloc, setAlloc] = useState<Record<string, string>>(deposit ? {} : spread(defaultAmountFils, ordered));
  const [manual, setManual] = useState(false);
  const [method, setMethod] = useState<Method | "">("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const received = parseFils(amount);
  const allocated = ordered.reduce((s, o) => s + parseFils(alloc[o.id] ?? ""), 0);
  const leftover = received - allocated;

  const payload = JSON.stringify({
    customerId,
    orderId: orderId ?? null,
    deposit,
    date,
    amount,
    method,
    reference,
    notes,
    allocations: deposit ? [] : ordered.map((o) => ({ invoiceId: o.id, amount: alloc[o.id] ?? "" })).filter((a) => parseFils(a.amount) > 0),
  });

  return (
    <ActionForm action={action} className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-5">
        <FormMessage message={state.ok ? undefined : state.message} />
        <section className="flex flex-col gap-5 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount received, AED</Label>
            <input
              id="amount"
              inputMode="decimal"
              autoFocus={!defaultAmountFils}
              value={amount}
              placeholder="0.00"
              onChange={(e) => {
                setAmount(e.target.value);
                if (!manual && !deposit) setAlloc(spread(parseFils(e.target.value), ordered));
              }}
              aria-invalid={errors.amount ? true : undefined}
              className="tabular h-16 w-full max-w-xs rounded-[10px] border border-line bg-surface px-4 font-display text-3xl outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
            />
            {errors.amount ? <p className="text-[13px] font-medium text-brand-deep">{errors.amount[0]}</p> : null}
          </div>
          <MethodChips value={method} onChange={setMethod} error={errors.method?.[0]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payDate">Date received</Label>
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
        {deposit ? (
          <section className="rounded-[14px] border border-line bg-surface p-5">
            <h2 className="text-lg font-medium">Deposit for this order</h2>
            <p className="mt-1 text-[15px] text-ink-muted">It is applied to the invoice when you make it, and printed there as paid in advance.</p>
          </section>
        ) : ordered.length ? (
          <section className="rounded-[14px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">What it pays</h2>
              {manual ? (
                <button
                  type="button"
                  className="text-[13px] font-semibold text-brand hover:underline"
                  onClick={() => {
                    setManual(false);
                    setAlloc(spread(received, ordered));
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
                    <p className="tabular text-[14px] font-semibold">{o.label}</p>
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
            <dl className="tabular mt-4 flex flex-col gap-1 border-t border-line pt-3 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Set against invoices</dt>
                <dd>{formatFils(allocated)}</dd>
              </div>
              {leftover !== 0 ? (
                <div className="flex justify-between">
                  <dt className={leftover < 0 ? "font-semibold text-brand-deep" : "text-ink-muted"}>{leftover < 0 ? "More than received" : "Kept as credit on account"}</dt>
                  <dd className={leftover < 0 ? "font-semibold text-brand-deep" : ""}>{formatFils(Math.abs(leftover))}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : (
          <section className="rounded-[14px] border border-line bg-surface p-5">
            <h2 className="text-lg font-medium">Nothing open</h2>
            <p className="mt-1 text-[15px] text-ink-muted">They have no unpaid invoices. This money is kept as credit on account and used on their next invoice.</p>
          </section>
        )}
        <SubmitButton size="lg" pendingText="Saving" disabled={received <= 0 || leftover < 0}>
          {received > 0 ? `Record ${formatFils(received)}` : "Record payment"}
        </SubmitButton>
        <LinkButton href={cancelHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </ActionForm>
  );
}
