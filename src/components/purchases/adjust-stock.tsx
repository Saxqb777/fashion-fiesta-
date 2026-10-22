"use client";

import { useActionState, useState } from "react";
import { adjustStock } from "@/actions/purchases";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_FORM_STATE } from "@/lib/forms";

/** Count the roll and type the real number. The difference is logged with the reason. */
export function AdjustStockButton({ fabricId, stockCenti, first }: { fabricId: string; stockCenti: number; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(adjustStock, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  const e = state.errors ?? {};
  return (
    <>
      <Button type="button" variant={first ? "default" : "outline"} size={first ? "default" : "sm"} onClick={() => setOpen(true)}>
        {first ? "Enter what is on the shelf" : "Count the roll"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{first ? "Stock on the shelf today" : "Count the roll"}</DialogTitle>
            <DialogDescription>Type the metres you have now. The app records the difference.</DialogDescription>
          </DialogHeader>
          <ActionForm action={action} className="flex flex-col gap-4">
            <input type="hidden" name="fabricId" value={fabricId} />
            <FormMessage message={state.ok ? undefined : state.message} />
            <TextField name="counted" label="Metres now" inputMode="decimal" defaultValue={stockCenti > 0 ? (stockCenti / 100).toFixed(2) : ""} errors={e.counted} className="tabular" autoFocus />
            <TextField name="reason" label="Why" defaultValue={first ? "Stock on the day we started" : ""} placeholder="Counted the roll" errors={e.reason} />
            <SubmitButton size="lg" pendingText="Saving">
              Save stock
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
