"use client";

import { useActionState, useState } from "react";
import { giveAdvance, paySalary, saveSalary } from "@/actions/salaries";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { cn } from "cn";

const filsInput = (f: number) => (f ? (f / 100).toFixed(2) : "");

function Err({ state, name }: { state: FormState; name: string }) {
  const m = state.errors?.[name]?.[0];
  return m ? <p className="text-[13px] font-medium text-brand-deep">{m}</p> : null;
}

function PotChoice({ value, onChange }: { value: "cash" | "bank"; onChange: (v: "cash" | "bank") => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">Paid from</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Paid from">
        {(["cash", "bank"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            onClick={() => onChange(p)}
            className={cn("h-11 rounded-full border px-5 text-[14px] font-semibold", value === p ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
          >
            {p === "cash" ? "Cash drawer" : "Bank"}
          </button>
        ))}
      </div>
    </div>
  );
}

type Person = { id: string; name: string; salaryFils: number | null; payDay: number | null };

export function SetSalaryButton({ person, label }: { person: Person; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveSalary, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {label ?? (person.salaryFils ? "Change salary" : "Set salary")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{person.name}&apos;s salary</DialogTitle>
            <DialogDescription>Monthly, and the day of the month it is paid. Leave the amount empty if the app should not track it.</DialogDescription>
          </DialogHeader>
          <ActionForm action={action} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={person.id} />
            <FormMessage message={state.ok ? undefined : state.message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salary">Salary a month, AED</Label>
                <Input id="salary" name="salary" inputMode="decimal" defaultValue={filsInput(person.salaryFils ?? 0)} className="tabular" aria-invalid={state.errors?.salary ? true : undefined} />
                <Err state={state} name="salary" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payDay">Pay day</Label>
                <Input id="payDay" name="payDay" inputMode="numeric" defaultValue={String(person.payDay ?? 1)} className="tabular" aria-invalid={state.errors?.payDay ? true : undefined} />
                <Err state={state} name="payDay" />
              </div>
            </div>
            <SubmitButton pendingText="Saving" className="self-end">
              Save
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdvanceButton({ person, today }: { person: Person; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(giveAdvance, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  const [pot, setPot] = useState<"cash" | "bank">("cash");
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Advance
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance to {person.name}</DialogTitle>
            <DialogDescription>Taken off the next salary by itself.</DialogDescription>
          </DialogHeader>
          <ActionForm key={state.savedAt} action={action} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={person.id} />
            <input type="hidden" name="pot" value={pot} />
            <FormMessage message={state.ok ? undefined : state.message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advAmount">Amount, AED</Label>
                <Input id="advAmount" name="amount" inputMode="decimal" className="tabular" aria-invalid={state.errors?.amount ? true : undefined} />
                <Err state={state} name="amount" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="advDate">Date</Label>
                <Input id="advDate" name="date" type="date" defaultValue={today} />
              </div>
            </div>
            <PotChoice value={pot} onChange={setPot} />
            <Input name="notes" placeholder="Note, optional" />
            <SubmitButton pendingText="Saving" className="self-end">
              Give advance
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PayButton({ person, month, monthLabel, advanceFils, today, urgent }: { person: Person & { salaryFils: number }; month: string; monthLabel: string; advanceFils: number; today: string; urgent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(paySalary, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  const [pot, setPot] = useState<"cash" | "bank">("cash");
  const [gross, setGross] = useState(filsInput(person.salaryFils));
  const [deduct, setDeduct] = useState(filsInput(Math.min(advanceFils, person.salaryFils)));
  const net = Math.round((Number(gross) || 0) * 100) - Math.round((Number(deduct) || 0) * 100);
  return (
    <>
      <Button size="sm" variant={urgent ? "default" : "outline"} onClick={() => setOpen(true)} data-mission="pay-salary" data-guide={`pay-${person.id}`}>
        Pay {monthLabel.split(" ")[0]}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-guide="pay-dialog">
          <DialogHeader>
            <DialogTitle>
              Pay {person.name}, {monthLabel}
            </DialogTitle>
            <DialogDescription>The whole salary is the expense. Advances are taken off what you hand over now.</DialogDescription>
          </DialogHeader>
          <ActionForm action={action} className="flex flex-col gap-4">
            <input type="hidden" name="userId" value={person.id} />
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="pot" value={pot} />
            <FormMessage message={state.ok ? undefined : state.message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gross">Salary for the month, AED</Label>
                <Input id="gross" name="gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value.replace(/[^\d.]/g, ""))} className="tabular" aria-invalid={state.errors?.gross ? true : undefined} />
                <Err state={state} name="gross" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deduct">Advances taken off</Label>
                <Input id="deduct" name="deduct" inputMode="decimal" value={deduct} onChange={(e) => setDeduct(e.target.value.replace(/[^\d.]/g, ""))} className="tabular" aria-invalid={state.errors?.deduct ? true : undefined} />
                {state.errors?.deduct ? <Err state={state} name="deduct" /> : <p className="text-[12px] text-ink-muted">{advanceFils ? `${formatFils(advanceFils)} in advances so far.` : "No advances."}</p>}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payDate">Date paid</Label>
                <Input id="payDate" name="date" type="date" defaultValue={today} />
              </div>
              <PotChoice value={pot} onChange={setPot} />
            </div>
            <p className="tabular rounded-[10px] bg-paper-deep/70 px-3 py-2 text-[15px]">
              Hand over <span className="font-display text-xl">{formatFils(Math.max(0, net))}</span>
            </p>
            <SubmitButton pendingText="Saving" className="self-end" disabled={net < 0}>
              Mark paid
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
