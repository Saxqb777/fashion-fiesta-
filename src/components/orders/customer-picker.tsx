"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { quickAddCustomer, searchCustomers, type CustomerOption } from "@/actions/documents";
import { TierTag } from "@/components/data/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

export function CustomerPicker({
  value,
  onPick,
  error,
}: {
  value: CustomerOption | null;
  onPick: (id: string | null) => void;
  error?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [newType, setNewType] = useState<"retail" | "wholesale">("retail");
  const [addError, setAddError] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (value) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => start(async () => setResults(await searchCustomers(q))), 200);
    return () => clearTimeout(timer.current);
  }, [q, value]);

  if (value) {
    return (
      <div data-guide="customer" className="flex items-center gap-3 rounded-[14px] border border-line bg-paper-deep/50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[16px] font-semibold">
            {value.name}
            {value.tier === "vip" ? <TierTag tier="vip" /> : null}
          </p>
          <p className="text-[13px] text-ink-muted">{[value.type === "wholesale" ? "Wholesale" : "Retail", value.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>
          <XIcon />
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">Customer</span>
      {adding ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-line p-4">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer name" autoFocus aria-label="New customer name" />
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone" type="tel" inputMode="tel" aria-label="New customer phone" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["retail", "wholesale"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  className={cn("h-10 rounded-[10px] border px-4 text-sm font-semibold", newType === t ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
                >
                  {t === "retail" ? "Retail" : "Wholesale"}
                </button>
              ))}
              <span className="flex-1" />
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await quickAddCustomer({ name: newName, phone: newPhone, type: newType });
                    if (res.id) {
                      setAdding(false);
                      onPick(res.id);
                    } else setAddError(res.error ?? "Could not add.");
                  })
                }
              >
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                Add and use
              </Button>
            </div>
            {addError ? <p className="text-[13px] font-medium text-brand-deep">{addError}</p> : null}
          </div>
        </div>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-muted" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search customers by name or phone"
            className="pl-10"
            aria-invalid={error ? true : undefined}
            aria-label="Search customers"
          />
          {pending ? <Loader2Icon className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-ink-muted" /> : null}
          {open ? (
            <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(31,26,23,0.25)]">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPick(c.id)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-paper-deep"
                  >
                    <span className="flex-1 truncate text-[15px] font-semibold">{c.name}</span>
                    {c.tier === "vip" ? <TierTag tier="vip" /> : null}
                    <span className="text-[13px] text-ink-muted">{c.phone}</span>
                  </button>
                </li>
              ))}
              <li className="border-t border-line">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setNewName(q.trim());
                    setAdding(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] font-semibold text-brand hover:bg-paper-deep"
                >
                  <PlusIcon className="size-4" />
                  {q.trim() ? `Add "${q.trim()}" as a new customer` : "Add a new customer"}
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      )}
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
    </div>
  );
}
