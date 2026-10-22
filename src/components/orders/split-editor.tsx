"use client";

import { PlusIcon, SplitIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import type { EditorAllocation } from "./document-editor";

let seq = 0;
const key = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;
const whole = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/**
 * Key accounts: one line split per branch and, if wanted, per person with a size.
 * Optional. When used, the parts add up to the line quantity.
 */
export function SplitEditor({
  index,
  qty,
  parts,
  branches,
  staff,
  error,
  onChange,
}: {
  index: number;
  qty: number;
  parts: EditorAllocation[];
  branches: { id: string; name: string }[];
  staff: { id: string; name: string; branchId: string | null; sizes: string | null }[];
  error?: string;
  onChange: (parts: EditorAllocation[]) => void;
}) {
  const sum = parts.reduce((s, p) => s + whole(p.qty), 0);
  const left = qty - sum;
  const set = (k: string, patch: Partial<EditorAllocation>) => onChange(parts.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  const listId = `staff-${index}`;

  if (!parts.length) {
    return (
      <button
        type="button"
        onClick={() => onChange([{ key: key(), branchId: "", staffId: "", personName: "", size: "", qty: qty ? String(qty) : "" }])}
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <SplitIcon className="size-4" />
        Split per branch
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Split per branch</span>
        <span className={cn("tabular text-[12px] font-semibold", left === 0 ? "text-[#4d7a12]" : "text-brand-deep")}>
          {left === 0 ? `All ${qty} split` : left > 0 ? `${left} still to split` : `${-left} more than the line`}
        </span>
      </div>
      <datalist id={listId}>
        {staff.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      {parts.map((p, j) => (
        <div key={p.key} className="grid grid-cols-[1fr_4.5rem_auto] gap-2 sm:grid-cols-[1.3fr_1.2fr_0.7fr_4.5rem_auto]">
          <select
            value={p.branchId}
            onChange={(e) => set(p.key, { branchId: e.target.value })}
            aria-label={`Line ${index + 1} part ${j + 1} branch`}
            className="col-span-3 h-11 min-w-0 rounded-[10px] border border-line bg-surface px-3 text-base sm:col-span-1"
          >
            <option value="">No branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Input
            list={listId}
            value={p.personName}
            onChange={(e) => {
              const v = e.target.value;
              const person = staff.find((s) => s.name.toLowerCase() === v.trim().toLowerCase() && (!p.branchId || !s.branchId || s.branchId === p.branchId));
              set(p.key, {
                personName: v,
                staffId: person?.id ?? "",
                ...(person && !p.size && person.sizes ? { size: person.sizes } : {}),
                ...(person?.branchId && !p.branchId ? { branchId: person.branchId } : {}),
              });
            }}
            placeholder="Person, optional"
            aria-label={`Line ${index + 1} part ${j + 1} person`}
          />
          <Input value={p.size} onChange={(e) => set(p.key, { size: e.target.value })} placeholder="Size" aria-label={`Line ${index + 1} part ${j + 1} size`} className="hidden sm:block" />
          <Input
            value={p.qty}
            inputMode="numeric"
            onChange={(e) => set(p.key, { qty: e.target.value.replace(/\D/g, "") })}
            aria-label={`Line ${index + 1} part ${j + 1} quantity`}
            className="tabular"
          />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove part ${j + 1}`} onClick={() => onChange(parts.filter((x) => x.key !== p.key))}>
            <XIcon />
          </Button>
          <Input value={p.size} onChange={(e) => set(p.key, { size: e.target.value })} placeholder="Size" aria-label={`Line ${index + 1} part ${j + 1} size, phone`} className="col-span-3 sm:hidden" />
        </div>
      ))}
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...parts, { key: key(), branchId: "", staffId: "", personName: "", size: "", qty: left > 0 ? String(left) : "" }])}
      >
        <PlusIcon />
        Add a part
      </Button>
    </div>
  );
}
