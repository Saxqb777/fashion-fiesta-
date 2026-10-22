"use client";

import { useActionState } from "react";
import { cancelPurchaseOrder } from "@/actions/purchases";
import { SubmitButton } from "@/components/form/submit-button";
import { EMPTY_FORM_STATE } from "@/lib/forms";

export function CancelPoButton({ id, draft }: { id: string; draft: boolean }) {
  const [state, action] = useActionState(cancelPurchaseOrder, EMPTY_FORM_STATE);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(draft ? "Delete this draft purchase order?" : "Cancel this purchase order? It stays on record as cancelled.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" pendingText="Saving">
        {draft ? "Delete draft" : "Cancel PO"}
      </SubmitButton>
      {state.message && !state.ok ? <p className="mt-1 text-[13px] text-brand-deep">{state.message}</p> : null}
    </form>
  );
}
