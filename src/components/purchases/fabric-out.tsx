"use client";

import { useActionState, useState } from "react";
import { ScissorsIcon, TruckIcon } from "lucide-react";
import { sendFabric, takeFabric } from "@/actions/purchases";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_FORM_STATE } from "@/lib/forms";

type Choice = { id: string; label: string; stockCenti?: number };

/**
 * Fabric leaving stock: "Fabric taken" for a task, "Fabric sent" to a stitching unit.
 * Metres come prefilled from the order line and stay editable.
 */
export function FabricOutButton({
  mode,
  refId,
  fabrics,
  defaultFabricId,
  defaultMetres,
  today,
  size = "default",
  variant = "outline",
  className,
}: {
  mode: "taken" | "sent";
  refId: string;
  fabrics: Choice[];
  defaultFabricId?: string | null;
  defaultMetres?: string;
  today: string;
  size?: "default" | "lg" | "sm";
  variant?: "default" | "outline";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(mode === "taken" ? takeFabric : sendFabric, EMPTY_FORM_STATE);
  useFormFeedback(state, () => setOpen(false));
  const e = state.errors ?? {};
  const Icon = mode === "taken" ? ScissorsIcon : TruckIcon;
  const title = mode === "taken" ? "Fabric taken" : "Fabric sent";
  return (
    <>
      <Button type="button" size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Icon />
        {title}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {mode === "taken" ? "Takes the metres out of stock for this task. Change the number if you cut more or less." : "Takes the metres out of stock, sent with the work to the unit."}
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={action} className="flex flex-col gap-4">
            <input type="hidden" name={mode === "taken" ? "taskId" : "poId"} value={refId} />
            <FormMessage message={state.ok ? undefined : state.message} />
            <SelectField name="fabricId" label="Fabric" defaultValue={defaultFabricId ?? ""} errors={e.fabricId}>
              <option value="" disabled>
                Pick the fabric
              </option>
              {fabrics.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                  {f.stockCenti !== undefined ? `, ${(f.stockCenti / 100).toFixed(2)} m in stock` : ""}
                </option>
              ))}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <TextField name="metres" label="Metres" inputMode="decimal" defaultValue={defaultMetres ?? ""} errors={e.metres} className="tabular" autoFocus />
              <TextField name="date" label="Date" type="date" defaultValue={today} errors={e.date} />
            </div>
            <TextField name="note" label="Note" placeholder="Optional" errors={e.note} />
            <SubmitButton size="lg" pendingText="Saving">
              {mode === "taken" ? "Take from stock" : "Send from stock"}
            </SubmitButton>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
