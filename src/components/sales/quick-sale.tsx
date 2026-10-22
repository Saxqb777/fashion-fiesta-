"use client";

import { useActionState, useMemo, useState } from "react";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createQuickSale } from "@/actions/sales";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { lineAmounts } from "@/lib/lines";
import { formatFils } from "@/lib/money";

type Product = { id: string; name: string; priceFils: number };
type Line = { key: string; productId: string | null; description: string; qty: number; price: string };

let seq = 0;
const key = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;
const toFils = (s: string) => Math.round((Number(s) || 0) * 100);

/** Counter sale on a phone: add items, then one tap for cash or card. */
export function QuickSale({ products, vatRateBp }: { products: Product[]; vatRateBp: number }) {
  const [state, action] = useActionState(createQuickSale, EMPTY_FORM_STATE);
  const [lines, setLines] = useState<Line[]>([]);
  const [term, setTerm] = useState("");
  const [showCustomer, setShowCustomer] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (t ? products.filter((p) => p.name.toLowerCase().includes(t)) : []).slice(0, 6);
  }, [products, term]);
  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const add = (p: Product | null) => {
    const description = p?.name ?? term.trim();
    if (!description) return;
    setLines((ls) => [...ls, { key: key(), productId: p?.id ?? null, description, qty: 1, price: p?.priceFils ? (p.priceFils / 100).toFixed(2) : "" }]);
    setTerm("");
  };
  const amounts = lines.map((l) => lineAmounts(l.qty, toFils(l.price), vatRateBp));
  const total = amounts.reduce((s, a) => s + a.totalFils, 0);
  const vat = amounts.reduce((s, a) => s + a.vatFils, 0);
  const ready = lines.length > 0 && lines.every((l) => toFils(l.price) > 0);
  const payload = JSON.stringify({ customerName, customerPhone, lines: lines.map((l) => ({ productId: l.productId, description: l.description, qty: l.qty, unitPrice: l.price })) });

  return (
    <ActionForm action={action} className="flex flex-col gap-4 pb-48 md:pb-0">
      <input type="hidden" name="payload" value={payload} />
      <FormMessage message={state.ok ? undefined : state.message} />
      <div className="relative">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(matches[0] ?? null);
            }
          }}
          placeholder="Type an item: abaya, shawl, alteration"
          aria-label="Item"
          className="h-14 text-[17px]"
        />
        {term.trim() ? (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(31,26,23,0.25)]">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-paper-deep">
                  <span className="flex-1 text-[16px] font-semibold">{p.name}</span>
                  {p.priceFils ? <span className="tabular text-[14px] text-ink-muted">{(p.priceFils / 100).toFixed(2)}</span> : null}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => add(null)} className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left text-[15px] font-semibold text-brand hover:bg-paper-deep">
                <PlusIcon className="size-4" />
                Add &quot;{term.trim()}&quot;
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      {lines.length ? (
        <ul className="flex flex-col gap-2">
          {lines.map((l, i) => (
            <li key={l.key} className="rounded-[14px] border border-line bg-surface p-3">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[16px] font-semibold">{l.description}</p>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${l.description}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2Icon className="text-ink-muted" />
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center rounded-[10px] border border-line">
                  <button type="button" aria-label="One less" className="flex size-12 items-center justify-center disabled:opacity-40" disabled={l.qty <= 1} onClick={() => update(l.key, { qty: l.qty - 1 })}>
                    <MinusIcon className="size-4" />
                  </button>
                  <span className="tabular w-8 text-center text-[17px] font-semibold">{l.qty}</span>
                  <button type="button" aria-label="One more" className="flex size-12 items-center justify-center" onClick={() => update(l.key, { qty: l.qty + 1 })}>
                    <PlusIcon className="size-4" />
                  </button>
                </div>
                <Input
                  value={l.price}
                  inputMode="decimal"
                  onChange={(e) => update(l.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                  placeholder="Price"
                  aria-label={`Item ${i + 1} price each, before VAT`}
                  aria-invalid={!toFils(l.price) ? true : undefined}
                  className="tabular h-12 w-28 text-[17px]"
                />
                <p className="tabular ml-auto font-display text-lg">{formatFils(amounts[i].totalFils, { currency: false })}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-[15px] text-ink-muted">Type what they are buying. Prices are before VAT; the total adds it.</p>
      )}

      {showCustomer ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" aria-label="Customer name" className="h-12" />
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone, for WhatsApp" aria-label="Customer phone" type="tel" inputMode="tel" className="h-12" />
        </div>
      ) : (
        <button type="button" onClick={() => setShowCustomer(true)} className="self-start text-[14px] font-semibold text-ink-muted hover:text-ink">
          Add customer name or phone
        </button>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-surface px-4 py-3 md:static md:rounded-[14px] md:border md:p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink-muted">Total with VAT{vat ? `, VAT ${formatFils(vat, { currency: false })}` : ""}</span>
          <span className="tabular font-display text-[2rem] leading-none">{formatFils(total)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SubmitButton name="method" value="cash" size="lg" className="h-14 text-[17px]" disabled={!ready} pendingText="Saving">
            Paid cash
          </SubmitButton>
          <SubmitButton name="method" value="card" size="lg" variant="outline" className="h-14 text-[17px]" disabled={!ready} pendingText="Saving">
            Paid card
          </SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
