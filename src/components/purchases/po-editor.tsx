"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { savePurchaseOrder } from "@/actions/purchases";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { lineAmountsCenti, parseCenti } from "@/lib/qty";
import { cn } from "cn";

export type PoSupplier = { id: string; name: string; type: "fabric" | "outsourcing"; trn: string | null };
export type PoFabric = { id: string; name: string; colour: string | null; costFils: number };
export type PoLineInput = {
  key: string;
  fabricId: string | null;
  soLineId?: string | null;
  taskId?: string | null;
  /** "For FF-SO-0003" on outsourcing lines made from an order. */
  hint?: string | null;
  description: string;
  unit: "m" | "pcs";
  qty: string;
  unitPrice: string;
};
export type PoInitial = {
  id?: string | null;
  isDraft: boolean;
  supplierId: string;
  poDate: string;
  expectedDate: string;
  notes: string;
  vat: boolean;
  lines: PoLineInput[];
};

let seq = 0;
const key = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const fabricLabel = (f: PoFabric) => [f.name, f.colour].filter(Boolean).join(", ");
const toFils = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

export function PoEditor({
  initial,
  suppliers,
  fabrics,
  vatRateBp,
  cancelHref,
}: {
  initial: PoInitial;
  suppliers: PoSupplier[];
  fabrics: PoFabric[];
  vatRateBp: number;
  cancelHref: string;
}) {
  const [state, action] = useActionState(savePurchaseOrder, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const supplier = suppliers.find((s) => s.id === supplierId);
  const outsourcing = supplier?.type === "outsourcing";
  const blank = (): PoLineInput => ({ key: key(), fabricId: null, description: "", unit: outsourcing ? "pcs" : "m", qty: "", unitPrice: "" });
  const [poDate, setPoDate] = useState(initial.poDate);
  const [expectedDate, setExpectedDate] = useState(initial.expectedDate);
  const [notes, setNotes] = useState(initial.notes);
  const [vat, setVat] = useState(initial.vat);
  const [lines, setLines] = useState<PoLineInput[]>(initial.lines.length ? initial.lines : [blank()]);
  const update = (k: string, patch: Partial<PoLineInput>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const amounts = lines.map((l) => lineAmountsCenti(parseCenti(l.qty) ?? 0, toFils(l.unitPrice), vat ? vatRateBp : 0));
  const subtotal = amounts.reduce((s, a) => s + a.netFils, 0);
  const vatTotal = amounts.reduce((s, a) => s + a.vatFils, 0);

  const payload = JSON.stringify({
    id: initial.id ?? null,
    supplierId,
    poDate,
    expectedDate,
    notes,
    vat,
    lines: lines.map((l) => ({ fabricId: l.fabricId, soLineId: l.soLineId ?? null, taskId: l.taskId ?? null, description: l.description, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice })),
  });

  return (
    <ActionForm action={action} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />
      <FormMessage message={state.ok ? undefined : state.message} />

      <section className="grid gap-4 rounded-[14px] border border-line bg-surface p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="supplierId">Supplier</Label>
          <select
            id="supplierId"
            value={supplierId}
            disabled={Boolean(initial.id)}
            onChange={(e) => {
              const next = suppliers.find((s) => s.id === e.target.value);
              setSupplierId(e.target.value);
              setVat(Boolean(next?.trn));
              setLines((ls) => ls.map((l) => (l.description || l.qty ? l : { ...l, unit: next?.type === "outsourcing" ? "pcs" : "m" })));
            }}
            aria-invalid={errors.supplierId ? true : undefined}
            className="h-11 rounded-[10px] border border-line bg-surface px-3 text-base disabled:opacity-70"
          >
            <option value="" disabled>
              Pick a supplier
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.type === "outsourcing" ? "(stitching unit)" : ""}
              </option>
            ))}
          </select>
          {errors.supplierId ? <p className="text-[13px] font-medium text-brand-deep">{errors.supplierId[0]}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="poDate">PO date</Label>
          <Input id="poDate" type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expectedDate">Expected by</Label>
          <Input id="expectedDate" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-[15px] sm:col-span-2">
          <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="size-5 accent-[#D7182A]" />
          Add VAT {vatRateBp / 100}%
          <span className="text-[13px] text-ink-muted">{supplier ? (supplier.trn ? `TRN ${supplier.trn}` : "No TRN on this supplier") : ""}</span>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-medium">Lines</h2>
          <p className="text-[13px] text-ink-muted">{outsourcing ? "Stitching charge per piece." : "Type any fabric. New names are added to your fabric list."}</p>
        </div>
        {errors.lines ? <p className="text-[13px] font-medium text-brand-deep">{errors.lines[0]}</p> : null}
        {lines.map((l, i) => (
          <PoLineCard
            key={l.key}
            index={i}
            line={l}
            fabrics={outsourcing ? [] : fabrics}
            total={amounts[i].totalFils}
            errors={errors}
            canRemove={lines.length > 1}
            onChange={(patch) => update(l.key, patch)}
            onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
          />
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={() => setLines((ls) => [...ls, blank()])}>
          <PlusIcon />
          Add line
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="poNotes">Notes for the supplier</Label>
          <Textarea id="poNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Deliver to the shop, call before coming" />
        </div>
        <dl className="tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd>{formatFils(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">VAT</dt>
            <dd>{formatFils(vatTotal)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-2xl font-medium">{formatFils(subtotal + vatTotal)}</dd>
          </div>
        </dl>
      </section>

      <div className="sticky bottom-20 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-4 py-3 md:bottom-3 md:mx-0 md:rounded-[14px] md:border md:px-5">
        <p className="tabular mr-auto text-sm text-ink-muted">
          Total <span className="ml-1 font-display text-xl font-medium text-ink">{formatFils(subtotal + vatTotal)}</span>
        </p>
        <Button variant="ghost" nativeButton={false} render={<Link href={cancelHref} />} className="hidden sm:inline-flex">
          Cancel
        </Button>
        {initial.isDraft ? (
          <SubmitButton name="intent" value="draft" variant="outline" size="lg" pendingText="Saving">
            Save as draft
          </SubmitButton>
        ) : null}
        <SubmitButton name="intent" value="confirm" size="lg" pendingText="Saving">
          {initial.isDraft ? "Confirm PO" : "Save changes"}
        </SubmitButton>
        {initial.isDraft ? <p className="w-full text-right text-[12px] text-ink-muted">Confirm gives it an FF-PO number so you can send it to the supplier.</p> : null}
      </div>
    </ActionForm>
  );
}

function PoLineCard({
  index,
  line,
  fabrics,
  total,
  errors,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: PoLineInput;
  fabrics: PoFabric[];
  total: number;
  errors: Record<string, string[] | undefined>;
  canRemove: boolean;
  onChange: (patch: Partial<PoLineInput>) => void;
  onRemove: () => void;
}) {
  const e = (f: string) => errors[`lines.${index}.${f}`]?.[0];
  const [suggest, setSuggest] = useState(false);
  const term = line.description.trim().toLowerCase();
  const matches = useMemo(() => (term ? fabrics.filter((f) => fabricLabel(f).toLowerCase().includes(term)) : fabrics).slice(0, 6), [fabrics, term]);
  return (
    <article className="rounded-[14px] border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <span className="tabular mt-3 w-5 shrink-0 text-[13px] font-semibold text-ink-muted">{index + 1}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {line.hint ? <p className="text-[12px] font-semibold text-ink-muted">{line.hint}</p> : null}
          <div className="relative">
            <Input
              value={line.description}
              onChange={(ev) => {
                const v = ev.target.value;
                const exact = fabrics.find((f) => fabricLabel(f).toLowerCase() === v.trim().toLowerCase() || f.name.toLowerCase() === v.trim().toLowerCase());
                onChange({ description: v, fabricId: exact?.id ?? null });
                setSuggest(true);
              }}
              onFocus={() => setSuggest(true)}
              onBlur={() => setTimeout(() => setSuggest(false), 150)}
              placeholder={fabrics.length ? "Fabric or item, for example Gabardine navy" : "What they make, for example School pinafore"}
              aria-label={`Line ${index + 1} description`}
              aria-invalid={e("description") ? true : undefined}
              className="text-[16px] font-semibold"
            />
            {suggest && matches.length ? (
              <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(31,26,23,0.25)]">
                {matches.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        onChange({ fabricId: f.id, description: fabricLabel(f), unit: "m", unitPrice: f.costFils ? (f.costFils / 100).toFixed(2) : line.unitPrice });
                        setSuggest(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-deep"
                    >
                      <span className="flex-1 truncate text-[15px] font-semibold">{fabricLabel(f)}</span>
                      {f.costFils ? <span className="tabular text-[13px] text-ink-muted">{(f.costFils / 100).toFixed(2)} per m</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {e("description") ? <p className="mt-1 text-[13px] font-medium text-brand-deep">{e("description")}</p> : null}
          </div>
          <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-2 sm:grid-cols-[1fr_auto_1fr_1fr] sm:gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-[12px] text-ink-muted">Qty</Label>
              <Input
                value={line.qty}
                inputMode="decimal"
                onChange={(ev) => onChange({ qty: ev.target.value.replace(/[^\d.]/g, "") })}
                aria-label={`Line ${index + 1} quantity`}
                aria-invalid={e("qty") ? true : undefined}
                className="tabular"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[12px] text-ink-muted">Unit</Label>
              <div className="flex h-11 rounded-[10px] border border-line p-0.5" role="radiogroup" aria-label={`Line ${index + 1} unit`}>
                {(["m", "pcs"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={line.unit === u}
                    onClick={() => onChange({ unit: u, fabricId: u === "pcs" ? null : line.fabricId })}
                    className={cn("rounded-[8px] px-3 text-[14px] font-semibold", line.unit === u ? "bg-ink text-paper" : "text-ink-muted")}
                  >
                    {u === "m" ? "Metres" : "Pieces"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[12px] text-ink-muted">Price per {line.unit === "m" ? "metre" : "piece"}</Label>
              <Input
                value={line.unitPrice}
                inputMode="decimal"
                placeholder="0.00"
                onChange={(ev) => onChange({ unitPrice: ev.target.value.replace(/[^\d.]/g, "") })}
                aria-label={`Line ${index + 1} price`}
                aria-invalid={e("unitPrice") || (line.description && !line.unitPrice) ? true : undefined}
                className="tabular"
              />
            </div>
            <div className="col-span-3 flex flex-col gap-1 sm:col-span-1">
              <Label className="text-[12px] text-ink-muted">With VAT</Label>
              <p className="tabular flex h-11 items-center justify-end font-display text-lg font-medium">{formatFils(total, { currency: false })}</p>
            </div>
          </div>
          {e("qty") || e("unitPrice") ? <p className="-mt-2 text-[13px] font-medium text-brand-deep">{e("qty") ?? e("unitPrice")}</p> : null}
        </div>
        {canRemove ? (
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
