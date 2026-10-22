"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState } from "react";
import { saveProduct } from "@/actions/catalog";
import { FormMessage, SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import type { Product } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { filsToInput } from "@/lib/labels";
import { ChoiceGroup } from "./choice-group";
import { useFormFeedback } from "./use-form-feedback";

export function ProductForm({
  product,
  categories,
  onSaved,
}: {
  product?: Product;
  categories: { id: string; name: string }[];
  onSaved?: () => void;
}) {
  const [state, action] = useActionState(saveProduct, EMPTY_FORM_STATE);
  useFormFeedback(state, onSaved);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <FormMessage message={state.ok ? undefined : state.message} />
      <TextField name="name" label="Product name" defaultValue={product?.name ?? ""} errors={e.name} placeholder="School pinafore, spa tunic, abaya" />
      <ChoiceGroup
        name="kind"
        label="Kind"
        defaultValue={product?.kind ?? "custom"}
        options={[
          { value: "custom", label: "Custom stitched" },
          { value: "ready_made", label: "Ready made" },
        ]}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="categoryId" label="Category" defaultValue={product?.categoryId ?? ""} errors={e.categoryId} hint={categories.length ? undefined : "Add categories in Settings."}>
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField name="price" label="Usual price, AED" inputMode="decimal" defaultValue={filsToInput(product?.priceFils ?? 0)} errors={e.price} hint="Before VAT. You can change it on each order." className="tabular" />
        <TextField
          name="metresPerPiece"
          label="Fabric per piece, metres"
          inputMode="decimal"
          defaultValue={product?.metresPerPieceCenti ? (product.metresPerPieceCenti / 100).toFixed(2) : ""}
          errors={e.metresPerPiece}
          hint="Optional. Fills the metres on each order line, so fabric stock goes out right."
          className="tabular"
        />
      </div>
      <TextAreaField name="notes" label="Notes" defaultValue={product?.notes ?? ""} errors={e.notes} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">{product ? "Save changes" : "Add product"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
