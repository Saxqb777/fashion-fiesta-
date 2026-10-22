"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { setEmbroideryDone, settleOperator } from "@/actions/embroidery";
import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { cn } from "cn";

export function DoneButton({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size={done ? "sm" : "lg"}
      variant={done ? "ghost" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setEmbroideryDone(id, !done);
          if (res.error) return void toast.error(res.error);
          toast.success(done ? "Back to to do." : "Done. It now counts in the balance.");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : done ? <RotateCcwIcon /> : <CheckIcon />}
      {done ? "Not done yet" : "Mark done"}
    </Button>
  );
}

/** Pay the operator, or take the shop's share from him. Prefilled with what is owed. */
export function SettleButton({ balanceFils, operatorName, today }: { balanceFils: number; operatorName: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(settleOperator, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  const [direction, setDirection] = useState<"to_operator" | "from_operator">(balanceFils >= 0 ? "to_operator" : "from_operator");
  const [pot, setPot] = useState<"cash" | "bank">("cash");
  return (
    <>
      <Button variant={balanceFils ? "default" : "outline"} onClick={() => setOpen(true)}>
        Settle up
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle with {operatorName}</DialogTitle>
            <DialogDescription>Part or all of it. The cash book records it.</DialogDescription>
          </DialogHeader>
          <ActionForm key={state.savedAt} action={action} className="flex flex-col gap-4">
            <input type="hidden" name="direction" value={direction} />
            <input type="hidden" name="pot" value={pot} />
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Direction">
              {(["to_operator", "from_operator"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={direction === d}
                  onClick={() => setDirection(d)}
                  className={cn("h-11 rounded-[10px] border text-[14px] font-semibold", direction === d ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
                >
                  {d === "to_operator" ? `Shop pays ${operatorName}` : `${operatorName} pays the shop`}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settleAmount">Amount, AED</Label>
                <Input id="settleAmount" name="amount" inputMode="decimal" className="tabular" defaultValue={balanceFils ? (Math.abs(balanceFils) / 100).toFixed(2) : ""} aria-invalid={state.errors?.amount ? true : undefined} />
                {state.errors?.amount ? <p className="text-[13px] font-medium text-brand-deep">{state.errors.amount[0]}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settleDate">Date</Label>
                <Input id="settleDate" name="date" type="date" defaultValue={today} />
              </div>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Paid in">
              {(["cash", "bank"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={pot === p}
                  onClick={() => setPot(p)}
                  className={cn("h-10 rounded-full border px-4 text-[13px] font-semibold", pot === p ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
                >
                  {p === "cash" ? "Cash" : "Bank transfer"}
                </button>
              ))}
            </div>
            <Input name="notes" placeholder="Note, optional" />
            <SubmitButton pendingText="Saving" className="self-end">
              Save
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
