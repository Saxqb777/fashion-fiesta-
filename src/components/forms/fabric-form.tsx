"use client";

import { ActionForm } from "@/components/form/action-form";
import Link from "next/link";
import { useActionState } from "react";
import { saveFabric } from "@/actions/catalog";
import { PhotoUpload } from "@/components/data/photo-upload";
import { FormMessage, SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import type { Fabric } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { filsToInput } from "@/lib/labels";

export function FabricForm({ fabric, suppliers }: { fabric?: Fabric; suppliers: { id: string; name: string }[] }) {
  const [state, action] = useActionState(saveFabric, EMPTY_FORM_STATE);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-6">
      {fabric ? <input type="hidden" name="id" value={fabric.id} /> : null}
      <FormMessage message={state.message} />
      <PhotoUpload name="photoUrl" folder="fabrics" defaultUrl={fabric?.photoUrl} label="Photo of the roll" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label="Fabric name" defaultValue={fabric?.name ?? ""} errors={e.name} placeholder="Nida, crepe, chiffon" />
        <TextField name="colour" label="Colour" defaultValue={fabric?.colour ?? ""} errors={e.colour} />
        <TextField name="code" label="Code" defaultValue={fabric?.code ?? ""} errors={e.code} hint="The supplier's code, if the roll has one." />
        <TextField name="shelfLocation" label="Where it sits" defaultValue={fabric?.shelfLocation ?? ""} errors={e.shelfLocation} placeholder="Rack B, shelf 2" hint="So a tailor can find the right roll." />
      </div>
      <SelectField name="supplierId" label="Bought from" defaultValue={fabric?.supplierId ?? ""} errors={e.supplierId}>
        <option value="">Not set</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="cost" label="Cost per metre, AED" inputMode="decimal" defaultValue={filsToInput(fabric?.costFils ?? 0)} errors={e.cost} hint="What you pay, before VAT." className="tabular" />
        <TextField name="price" label="Selling price per metre, AED" inputMode="decimal" defaultValue={filsToInput(fabric?.priceFils ?? 0)} errors={e.price} hint="When a customer buys fabric only, before VAT." className="tabular" />
      </div>
      <TextAreaField name="notes" label="Notes" defaultValue={fabric?.notes ?? ""} errors={e.notes} />
      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <Button variant="ghost" nativeButton={false} render={<Link href="/purchases/fabrics" />}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving">{fabric ? "Save changes" : "Add fabric"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
