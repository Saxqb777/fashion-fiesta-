"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MapPinIcon, PlusIcon, RulerIcon, Trash2Icon, UserRoundIcon, XIcon } from "lucide-react";
import { getCustomerContext, saveOrder, saveQuote, type CustomerContext } from "@/actions/documents";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { lineAmounts } from "@/lib/lines";
import { formatFils } from "@/lib/money";
import { cn } from "cn";
import { CustomerPicker } from "./customer-picker";
import { MeasurementDialog, type MeasurementSet } from "./measurement-dialog";

export type EditorAssignment = { key: string; taskId?: string | null; type: "tailor" | "unit"; assigneeId: string; qty: string; locked?: boolean };
export type EditorLine = {
  key: string;
  id?: string | null;
  productId?: string | null;
  description: string;
  qty: string;
  unitPrice: string;
  notes: string;
  dueDate: string;
  fabricId: string;
  measurementId: string;
  measurementLabel?: string | null;
  assignments: EditorAssignment[];
};
export type EditorInitial = {
  id?: string | null;
  number?: string;
  context: CustomerContext | null;
  branchId: string;
  date: string;
  dueDate: string;
  validUntil: string;
  notes: string;
  sourceQuoteId?: string | null;
  lines: EditorLine[];
};
type Product = { id: string; name: string; priceFils: number };
type Fabric = { id: string; name: string; colour: string | null; shelfLocation: string | null };
type Option = { id: string; name: string };

let seq = 0;
const key = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;
export const blankLine = (dueDate = ""): EditorLine => ({
  key: key(),
  description: "",
  qty: "1",
  unitPrice: "",
  notes: "",
  dueDate,
  fabricId: "",
  measurementId: "",
  assignments: [],
});
const toFils = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const toQty = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const filsInput = (fils: number) => (fils / 100).toFixed(2);

export function DocumentEditor({
  mode,
  initial,
  products,
  fabrics,
  tailors,
  units,
  fields,
  vatRateBp,
  cancelHref,
}: {
  mode: "quote" | "order";
  initial: EditorInitial;
  products: Product[];
  fabrics: Fabric[];
  tailors: Option[];
  units: Option[];
  fields: string[];
  vatRateBp: number;
  cancelHref: string;
}) {
  const isOrder = mode === "order";
  const [state, action] = useActionState(isOrder ? saveOrder : saveQuote, EMPTY_FORM_STATE);
  const errors = state.errors ?? {};
  const [ctx, setCtx] = useState<CustomerContext | null>(initial.context);
  const [loadingCtx, startCtx] = useTransition();
  const [branchId, setBranchId] = useState(initial.branchId);
  const [date, setDate] = useState(initial.date);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<EditorLine[]>(initial.lines.length ? initial.lines : [blankLine(initial.dueDate)]);
  const [measureFor, setMeasureFor] = useState<string | null>(null);

  const pickCustomer = (id: string | null) => {
    if (!id) {
      setCtx(null);
      setBranchId("");
      return;
    }
    startCtx(async () => {
      const next = await getCustomerContext(id);
      setCtx(next);
      setBranchId("");
      // A new customer's measurement sets differ: clear choices that no longer apply.
      setLines((ls) => ls.map((l) => (next?.measurements.some((m) => m.id === l.measurementId) ? l : { ...l, measurementId: "" })));
    });
  };

  const update = (k: string, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const amounts = lines.map((l) => lineAmounts(toQty(l.qty), toFils(l.unitPrice), vatRateBp));
  const subtotal = amounts.reduce((s, a) => s + a.netFils, 0);
  const vat = amounts.reduce((s, a) => s + a.vatFils, 0);

  const payload = JSON.stringify({
    id: initial.id ?? null,
    customerId: ctx?.customer.id ?? "",
    branchId: branchId || null,
    date,
    dueDate,
    validUntil,
    notes,
    sourceQuoteId: initial.sourceQuoteId ?? null,
    lines: lines.map((l) => ({
      id: l.id ?? null,
      productId: l.productId ?? null,
      description: l.description,
      qty: Number(l.qty),
      unitPrice: l.unitPrice,
      notes: l.notes,
      dueDate: l.dueDate,
      fabricId: l.fabricId || null,
      measurementId: l.measurementId || null,
      assignments: isOrder ? l.assignments.map((a) => ({ taskId: a.taskId ?? null, type: a.type, assigneeId: a.assigneeId, qty: Number(a.qty) })) : [],
    })),
  });

  return (
    <ActionForm action={action} className="flex flex-col gap-6">
      <input type="hidden" name="payload" value={payload} />
      <FormMessage message={state.ok ? undefined : state.message} />

      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
        <CustomerPicker
          value={ctx?.customer ?? null}
          onPick={pickCustomer}
          error={errors.customerId?.[0]}
        />
        {loadingCtx ? <p className="text-sm text-ink-muted">Loading their branches and measurements</p> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          {ctx?.branches.length ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch">Branch</Label>
              <select id="branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-11 rounded-[10px] border border-line bg-surface px-3 text-base">
                <option value="">Main, no branch</option>
                {ctx.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="docDate">{isOrder ? "Order date" : "Quote date"}</Label>
            <Input id="docDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {isOrder ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orderDue">Order due</Label>
              <Input
                id="orderDue"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  const next = e.target.value;
                  // Lines that followed the old order date follow the new one.
                  setLines((ls) => ls.map((l) => (l.dueDate === dueDate || !l.dueDate ? { ...l, dueDate: next } : l)));
                  setDueDate(next);
                }}
                aria-invalid={errors.dueDate ? true : undefined}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="validUntil">Valid until</Label>
              <Input id="validUntil" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-medium">Lines</h2>
          <p className="text-[13px] text-ink-muted">Type anything. New items are saved as products for next time.</p>
        </div>
        {errors.lines ? <p className="text-[13px] font-medium text-brand-deep">{errors.lines[0]}</p> : null}
        {lines.map((l, i) => (
          <LineCard
            key={l.key}
            index={i}
            line={l}
            mode={mode}
            amount={amounts[i]}
            errors={errors}
            products={products}
            fabrics={fabrics}
            tailors={tailors}
            units={units}
            ctx={ctx}
            canRemove={lines.length > 1 && !l.assignments.some((a) => a.locked)}
            onChange={(patch) => update(l.key, patch)}
            onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
            onMeasure={() => setMeasureFor(l.key)}
          />
        ))}
        <Button type="button" variant="outline" className="self-start" onClick={() => setLines((ls) => [...ls, blankLine(dueDate)])}>
          <PlusIcon />
          Add line
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="docNotes">Notes</Label>
          <Textarea id="docNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isOrder ? "Delivery to reception, two fittings" : "Prices valid for this term"} />
        </div>
        <dl className="tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd>{formatFils(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">VAT {vatRateBp / 100}%</dt>
            <dd>{formatFils(vat)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-2xl font-medium">{formatFils(subtotal + vat)}</dd>
          </div>
        </dl>
      </section>

      <div className="sticky bottom-20 z-20 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-[14px] md:border md:px-4">
        <Button variant="ghost" nativeButton={false} render={<Link href={cancelHref} />}>
          Cancel
        </Button>
        <SubmitButton size="lg" pendingText="Saving">
          {initial.id ? "Save changes" : isOrder ? (initial.sourceQuoteId ? "Confirm order" : "Save order") : "Save quote"}
        </SubmitButton>
      </div>

      {ctx ? (
        <MeasurementDialog
          open={measureFor !== null}
          onOpenChange={(o) => !o && setMeasureFor(null)}
          customerId={ctx.customer.id}
          fields={fields}
          onSaved={(set: MeasurementSet) => {
            setCtx((c) => (c ? { ...c, measurements: [...c.measurements, set] } : c));
            if (measureFor) update(measureFor, { measurementId: set.id });
          }}
        />
      ) : null}
    </ActionForm>
  );
}

function LineCard({
  index,
  line,
  mode,
  amount,
  errors,
  products,
  fabrics,
  tailors,
  units,
  ctx,
  canRemove,
  onChange,
  onRemove,
  onMeasure,
}: {
  index: number;
  line: EditorLine;
  mode: "quote" | "order";
  amount: { totalFils: number };
  errors: Record<string, string[] | undefined>;
  products: Product[];
  fabrics: Fabric[];
  tailors: Option[];
  units: Option[];
  ctx: CustomerContext | null;
  canRemove: boolean;
  onChange: (patch: Partial<EditorLine>) => void;
  onRemove: () => void;
  onMeasure: () => void;
}) {
  const e = (f: string) => errors[`lines.${index}.${f}`]?.[0];
  const [showNotes, setShowNotes] = useState(Boolean(line.notes));
  const [suggest, setSuggest] = useState(false);
  const term = line.description.trim().toLowerCase();
  const matches = useMemo(
    () => (term ? products.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 6) : products.slice(0, 6)),
    [products, term],
  );
  const lastPrice = line.productId ? ctx?.lastPrices[line.productId] : undefined;
  const qty = toQty(line.qty);
  const assigned = line.assignments.reduce((s, a) => s + (toQty(a.qty) || 0), 0);
  const left = qty - assigned;
  const set = ctx?.measurements.find((m) => m.id === line.measurementId);

  const pickProduct = (p: Product) => {
    const price = ctx?.lastPrices[p.id] ?? p.priceFils;
    onChange({ productId: p.id, description: p.name, unitPrice: price ? filsInput(price) : line.unitPrice });
    setSuggest(false);
  };

  return (
    <article className="rounded-[14px] border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <span className="tabular mt-3 w-5 shrink-0 text-[13px] font-semibold text-ink-muted">{index + 1}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative">
            <Input
              value={line.description}
              onChange={(ev) => {
                const v = ev.target.value;
                const exact = products.find((p) => p.name.toLowerCase() === v.trim().toLowerCase());
                onChange({ description: v, productId: exact?.id ?? null });
                setSuggest(true);
              }}
              onFocus={() => setSuggest(true)}
              onBlur={() => setTimeout(() => setSuggest(false), 150)}
              placeholder="What is it? School pinafore, abaya, alteration"
              aria-label={`Line ${index + 1} description`}
              aria-invalid={e("description") ? true : undefined}
              className="text-[16px] font-semibold"
            />
            {suggest && matches.length ? (
              <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(31,26,23,0.25)]">
                {matches.map((p) => {
                  const last = ctx?.lastPrices[p.id];
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => pickProduct(p)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper-deep"
                      >
                        <span className="flex-1 truncate text-[15px] font-semibold">{p.name}</span>
                        {last !== undefined ? (
                          <span className="tabular rounded-full bg-magenta/10 px-2 py-0.5 text-[12px] font-semibold text-magenta">Last time {filsInput(last)}</span>
                        ) : p.priceFils ? (
                          <span className="tabular text-[13px] text-ink-muted">{filsInput(p.priceFils)}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {e("description") ? <p className="mt-1 text-[13px] font-medium text-brand-deep">{e("description")}</p> : null}
          </div>

          <div className="grid grid-cols-[0.8fr_1.2fr_1.2fr] gap-2 sm:gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-[12px] text-ink-muted">Qty</Label>
              <Input
                value={line.qty}
                inputMode="numeric"
                onChange={(ev) => onChange({ qty: ev.target.value.replace(/\D/g, "") })}
                aria-label={`Line ${index + 1} quantity`}
                aria-invalid={e("qty") ? true : undefined}
                className="tabular"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[12px] text-ink-muted">Price, AED</Label>
              <Input
                value={line.unitPrice}
                inputMode="decimal"
                onChange={(ev) => onChange({ unitPrice: ev.target.value.replace(/[^\d.]/g, "") })}
                placeholder="0.00"
                aria-label={`Line ${index + 1} price before VAT`}
                aria-invalid={e("unitPrice") ? true : undefined}
                className="tabular"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[12px] text-ink-muted">With VAT</Label>
              <p className="tabular flex h-11 items-center justify-end font-display text-lg font-medium">{formatFils(amount.totalFils, { currency: false })}</p>
            </div>
          </div>
          {e("qty") || e("unitPrice") ? <p className="-mt-2 text-[13px] font-medium text-brand-deep">{e("qty") ?? e("unitPrice")}</p> : null}
          {lastPrice !== undefined && filsInput(lastPrice) !== Number(line.unitPrice || 0).toFixed(2) ? (
            <button
              type="button"
              onClick={() => onChange({ unitPrice: filsInput(lastPrice) })}
              className="-mt-1 self-start rounded-full bg-magenta/10 px-2.5 py-1 text-[12px] font-semibold text-magenta"
            >
              Last time {filsInput(lastPrice)}. Use it
            </button>
          ) : null}

          {mode === "order" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px] text-ink-muted">Due</Label>
                  <Input type="date" value={line.dueDate} onChange={(ev) => onChange({ dueDate: ev.target.value })} aria-label={`Line ${index + 1} due date`} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px] text-ink-muted">Fabric</Label>
                  <select
                    value={line.fabricId}
                    onChange={(ev) => onChange({ fabricId: ev.target.value })}
                    aria-label={`Line ${index + 1} fabric`}
                    className="h-11 rounded-[10px] border border-line bg-surface px-3 text-base"
                  >
                    <option value="">No fabric</option>
                    {fabrics.map((f) => (
                      <option key={f.id} value={f.id}>
                        {[f.name, f.colour].filter(Boolean).join(", ")}
                        {f.shelfLocation ? ` · ${f.shelfLocation}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px] text-ink-muted">Measurements, optional</Label>
                  <div className="flex gap-1.5">
                    <select
                      value={line.measurementId}
                      onChange={(ev) => onChange({ measurementId: ev.target.value })}
                      disabled={!ctx}
                      aria-label={`Line ${index + 1} measurements`}
                      className="h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-base disabled:opacity-60"
                    >
                      <option value="">None</option>
                      {line.measurementId && !set && line.measurementLabel ? <option value={line.measurementId}>{line.measurementLabel} (as taken)</option> : null}
                      {ctx?.measurements.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" size="icon" aria-label="Take new measurements" disabled={!ctx} onClick={onMeasure}>
                      <RulerIcon />
                    </Button>
                  </div>
                </div>
              </div>
              {set ? (
                <p className="-mt-1 text-[12px] text-ink-muted">
                  {set.values.map((v) => `${v.name} ${v.value}`).join(" · ")}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 rounded-[10px] bg-paper-deep/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">Who makes it</span>
                  <span className={cn("tabular text-[12px] font-semibold", left < 0 ? "text-brand-deep" : left > 0 ? "text-ink-muted" : "text-[#4d7a12]")}>
                    {qty === 0 ? "" : left === 0 ? "All assigned" : left > 0 ? `${left} not assigned yet` : `${-left} too many`}
                  </span>
                </div>
                {line.assignments.map((a, j) => (
                  <div key={a.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-muted">
                        {a.type === "unit" ? <MapPinIcon className="size-4" /> : <UserRoundIcon className="size-4" />}
                      </span>
                      <select
                        value={a.assigneeId ? `${a.type}:${a.assigneeId}` : ""}
                        disabled={a.locked}
                        onChange={(ev) => {
                          const [type, id] = ev.target.value.split(":");
                          onChange({ assignments: line.assignments.map((x) => (x.key === a.key ? { ...x, type: type as "tailor" | "unit", assigneeId: id ?? "" } : x)) });
                        }}
                        aria-label={`Line ${index + 1} assignee ${j + 1}`}
                        className="h-11 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-base disabled:opacity-70"
                      >
                        <option value="">Pick a tailor or unit</option>
                        {tailors.length ? (
                          <optgroup label="Tailors">
                            {tailors.map((t) => (
                              <option key={t.id} value={`tailor:${t.id}`}>
                                {t.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {units.length ? (
                          <optgroup label="Stitching units">
                            {units.map((u) => (
                              <option key={u.id} value={`unit:${u.id}`}>
                                {u.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>
                      <Input
                        value={a.qty}
                        inputMode="numeric"
                        disabled={a.locked}
                        onChange={(ev) =>
                          onChange({ assignments: line.assignments.map((x) => (x.key === a.key ? { ...x, qty: ev.target.value.replace(/\D/g, "") } : x)) })
                        }
                        aria-label={`Line ${index + 1} assignee ${j + 1} quantity`}
                        className="tabular w-20 shrink-0"
                      />
                      {a.locked ? (
                        <span className="w-11 shrink-0 text-center text-[11px] font-semibold text-ink-muted">Started</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove assignment"
                          onClick={() => onChange({ assignments: line.assignments.filter((x) => x.key !== a.key) })}
                        >
                          <XIcon />
                        </Button>
                      )}
                    </div>
                    {errors[`lines.${index}.assignments.${j}`] ? (
                      <p className="text-[13px] font-medium text-brand-deep">{errors[`lines.${index}.assignments.${j}`]?.[0]}</p>
                    ) : null}
                  </div>
                ))}
                {e("assignments") ? <p className="text-[13px] font-medium text-brand-deep">{e("assignments")}</p> : null}
                {tailors.length || units.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start bg-surface"
                    onClick={() =>
                      onChange({
                        assignments: [
                          ...line.assignments,
                          { key: key(), type: "tailor", assigneeId: tailors.length === 1 && !line.assignments.length ? tailors[0].id : "", qty: String(Math.max(left, 1)) },
                        ],
                      })
                    }
                  >
                    <PlusIcon />
                    {line.assignments.length ? "Split with someone else" : "Assign"}
                  </Button>
                ) : (
                  <p className="text-[13px] text-ink-muted">Add tailors in Settings, Team, or stitching units in Purchases, to assign work.</p>
                )}
              </div>
            </>
          ) : null}

          {showNotes ? (
            <Textarea value={line.notes} onChange={(ev) => onChange({ notes: ev.target.value })} placeholder="Size, colour, details for the tailor" aria-label={`Line ${index + 1} notes`} />
          ) : (
            <button type="button" onClick={() => setShowNotes(true)} className="self-start text-[13px] font-semibold text-ink-muted hover:text-ink">
              Add a note
            </button>
          )}
        </div>
        {canRemove ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
            <Trash2Icon className="text-ink-muted" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
