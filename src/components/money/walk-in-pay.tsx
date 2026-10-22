"use client";

import { useActionState, useState } from "react";
import { invoiceAndPay } from "@/actions/money";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";
import { MethodChips, type Method } from "./form-bits";

/** Walk in at the counter: Tax Invoice and payment in one step. */
export function WalkInPay({ orderId, amountFils, variant = "default" }: { orderId: string; amountFils: number; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method | "">("");
  const [state, action] = useActionState(invoiceAndPay, EMPTY_FORM_STATE);
  return (
    <>
      <Button size="lg" variant={variant} onClick={() => setOpen(true)}>
        Invoice and take payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take {formatFils(amountFils)}</DialogTitle>
            <DialogDescription>Issues the Tax Invoice for everything on the order, records the payment and marks it delivered. One step.</DialogDescription>
          </DialogHeader>
          <ActionForm action={action} className="flex flex-col gap-4">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="method" value={method} />
            <FormMessage message={state.message} />
            <MethodChips value={method} onChange={setMethod} error={state.errors?.method?.[0]} />
            <SubmitButton size="lg" pendingText="Saving" disabled={!method}>
              Paid, {formatFils(amountFils)}
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
