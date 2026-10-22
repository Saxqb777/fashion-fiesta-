"use client";

import { useActionState, useState } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
import { closeDay, moveMoney } from "@/actions/cash";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { cn } from "cn";

const parse = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? Math.round(n * 100) : null;
};

/** End of day: count the drawer, see the difference before saving. */
export function CloseDayForm({ expectedFils, cardFils, counted: start }: { expectedFils: number; cardFils: number; counted?: number | null }) {
  const [state, action] = useActionState(closeDay, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const [counted, setCounted] = useState(start != null ? (start / 100).toFixed(2) : "");
  const c = parse(counted);
  const diff = c === null ? null : c - expectedFils;
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <FormMessage message={state.ok ? undefined : state.message} />
      <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-1 text-[15px] sm:max-w-md">
        <dt className="text-ink-muted">Expected in the drawer</dt>
        <dd className="text-right font-semibold">{formatFils(expectedFils)}</dd>
        <dt className="text-ink-muted">Card today</dt>
        <dd className="text-right">{formatFils(cardFils)}</dd>
      </dl>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="counted">Cash you counted, AED</Label>
          <input
            id="counted"
            name="counted"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            aria-invalid={state.errors?.counted ? true : undefined}
            className="tabular h-14 w-48 rounded-[10px] border border-line bg-surface px-4 font-display text-2xl outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 aria-invalid:border-brand"
          />
        </div>
        <p className={cn("tabular pb-3 text-[15px] font-semibold", diff === null ? "text-ink-muted" : diff === 0 ? "text-[#4d7a12]" : "text-brand")}>
          {diff === null ? "Count the notes and coins, then type the total." : diff === 0 ? "Matches." : diff > 0 ? `Over by ${formatFils(diff)}` : `Short by ${formatFils(-diff)}`}
        </p>
      </div>
      {state.errors?.counted ? <p className="-mt-2 text-[13px] font-medium text-brand-deep">{state.errors.counted[0]}</p> : null}
      <Input name="notes" placeholder="Note, optional. For example: paid the delivery boy 20 from the drawer" className="sm:max-w-md" />
      <SubmitButton size="lg" pendingText="Closing" className="self-start" disabled={c === null}>
        {start != null ? "Count again" : "Close the day"}
      </SubmitButton>
    </ActionForm>
  );
}

export function MoveMoneyButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(moveMoney, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  const [from, setFrom] = useState<"cash" | "bank">("cash");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ArrowLeftRightIcon />
        Move money
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move money</DialogTitle>
            <DialogDescription>Cash taken to the bank, or cash drawn from the bank for the drawer.</DialogDescription>
          </DialogHeader>
          <ActionForm key={state.savedAt} action={action} className="flex flex-col gap-4">
            <input type="hidden" name="from" value={from} />
            <div className="flex gap-1.5" role="radiogroup" aria-label="Direction">
              {(["cash", "bank"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={from === f}
                  onClick={() => setFrom(f)}
                  className={cn("h-11 flex-1 rounded-[10px] border text-[14px] font-semibold", from === f ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
                >
                  {f === "cash" ? "Drawer to bank" : "Bank to drawer"}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="moveAmount">Amount, AED</Label>
                <Input id="moveAmount" name="amount" inputMode="decimal" className="tabular" aria-invalid={state.errors?.amount ? true : undefined} />
                {state.errors?.amount ? <p className="text-[13px] font-medium text-brand-deep">{state.errors.amount[0]}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="moveDate">Date</Label>
                <Input id="moveDate" name="date" type="date" defaultValue={today} />
              </div>
            </div>
            <Input name="notes" placeholder="Note, optional. Deposit slip number" />
            <SubmitButton pendingText="Saving" className="self-end">
              Move it
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
