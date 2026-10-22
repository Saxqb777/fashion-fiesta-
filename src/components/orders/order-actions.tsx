"use client";

import { useActionState } from "react";
import { deleteDraftOrder, setOrderStage } from "@/actions/documents";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { EMPTY_FORM_STATE } from "@/lib/forms";

/** One next action under the stage tracker. */
export function OrderStageButton({ orderId, to, label, confirmText }: { orderId: string; to: "ready" | "delivered"; label: string; confirmText?: string }) {
  const [state, action] = useActionState(setOrderStage, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={orderId} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton size="lg" pendingText="Saving">
        {label}
      </SubmitButton>
      {state.message && !state.ok ? <p className="mt-1 text-[13px] text-brand-deep">{state.message}</p> : null}
    </form>
  );
}

export function DeleteDraftButton({ orderId }: { orderId: string }) {
  const [state, action] = useActionState(deleteDraftOrder, EMPTY_FORM_STATE);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Delete this draft? It has no number and no tasks, so nothing else changes.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={orderId} />
      <SubmitButton variant="ghost" size="lg" pendingText="Deleting">
        Delete draft
      </SubmitButton>
      {state.message && !state.ok ? <p className="mt-1 text-[13px] text-brand-deep">{state.message}</p> : null}
    </form>
  );
}
