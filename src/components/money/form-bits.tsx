"use client";

import { cn } from "cn";
import { formatFils } from "@/lib/money";

export const parseFils = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
export const parseQty = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
export const filsInput = (fils: number) => (fils / 100).toFixed(2);

export const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
] as const;
export type Method = (typeof METHODS)[number]["value"];

/** How they paid. Big chips, easy on a phone. */
export function MethodChips({ value, onChange, error }: { value: Method | ""; onChange: (m: Method) => void; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold">How they paid</legend>
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap" role="radiogroup" aria-label="How they paid">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={value === m.value}
            onClick={() => onChange(m.value)}
            className={cn(
              "h-12 rounded-[10px] border px-4 text-[15px] font-semibold transition-colors sm:min-w-[110px]",
              value === m.value ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:bg-paper-deep",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
    </fieldset>
  );
}

/** A totals box: rows, then one strong last row. */
export function TotalsBox({ rows, strong, className }: { rows: [string, number, string?][]; strong: [string, number]; className?: string }) {
  return (
    <dl className={cn("tabular flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-5 text-[15px]", className)}>
      {rows.map(([label, fils, tone]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-ink-muted">{label}</dt>
          <dd className={tone}>{formatFils(fils)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
        <dt className="font-semibold">{strong[0]}</dt>
        <dd className="font-display text-2xl font-medium">{formatFils(strong[1])}</dd>
      </div>
    </dl>
  );
}

/** Quantity box with a "of 12" hint and a max button. */
export function QtyStepper({ id, value, max, onChange, error }: { id: string; value: string; max: number; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          aria-invalid={error ? true : undefined}
          className="tabular h-11 w-20 rounded-[10px] border border-line bg-surface px-3 text-right text-base outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
        />
        <span className="tabular w-14 text-[13px] text-ink-muted">of {max}</span>
      </div>
      {error ? <p className="text-[12px] font-medium text-brand-deep">{error}</p> : null}
    </div>
  );
}
