"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { saveMeasurementSet, type MeasurementSetResult } from "@/actions/measurements";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MeasurementSet = NonNullable<MeasurementSetResult["set"]>;

/** Add or re measure a set. Re measuring keeps the old one in history. */
export function MeasurementDialog({
  open,
  onOpenChange,
  customerId,
  fields,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  fields: string[];
  editing?: MeasurementSet | null;
  onSaved?: (set: MeasurementSet) => void;
}) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const current = new Map(editing?.values.map((v) => [v.name, v.value]));
  const allFields = [...fields, ...(editing?.values.map((v) => v.name).filter((n) => !fields.includes(n)) ?? [])];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Re measure ${editing.label}` : "New measurements"}</DialogTitle>
          <DialogDescription>
            {editing ? "The old set stays in history. Orders already made keep their copy." : "Leave any measurement empty if you did not take it."}
          </DialogDescription>
        </DialogHeader>
        <form
          key={editing?.id ?? "new"}
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // The dialog is portalled but React still bubbles submit to a parent form.
            e.stopPropagation();
            const fd = new FormData(e.currentTarget);
            const values: Record<string, string> = {};
            for (const f of allFields) values[f] = String(fd.get(`m_${f}`) ?? "");
            start(async () => {
              const res = await saveMeasurementSet({
                customerId,
                replacesId: editing?.id,
                label: String(fd.get("label") ?? ""),
                values,
                notes: String(fd.get("notes") ?? ""),
              });
              if (res.ok && res.set) {
                setErrors({});
                toast.success(`${res.set.label} saved.`);
                onSaved?.(res.set);
                onOpenChange(false);
              } else {
                setErrors(res.errors ?? {});
                if (res.error) toast.error(res.error);
              }
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Whose measurements</Label>
            <Input id="label" name="label" defaultValue={editing?.label ?? ""} placeholder="Self, Daughter, Size M" aria-invalid={errors.label ? true : undefined} />
            {errors.label ? <p className="text-[13px] font-medium text-brand-deep">{errors.label[0]}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {allFields.map((f) => (
              <div key={f} className="flex flex-col gap-1">
                <Label htmlFor={`m_${f}`} className="text-[13px]">
                  {f}
                </Label>
                <Input id={`m_${f}`} name={`m_${f}`} inputMode="decimal" defaultValue={current.get(f) ?? ""} className="tabular h-12 text-lg" />
              </div>
            ))}
          </div>
          {errors.values ? <p className="text-[13px] font-medium text-brand-deep">{errors.values[0]}</p> : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" placeholder="Loose fit, long sleeves" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              Save measurements
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
