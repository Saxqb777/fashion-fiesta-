"use client";

import { useActionState } from "react";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Archive keeps history. Restore brings it back. */
export function ArchiveButton({
  action,
  id,
  archived,
  noun,
  size = "sm",
}: {
  action: Action;
  id: string;
  archived: boolean;
  noun: string;
  size?: "sm" | "default";
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!archived && !window.confirm(`Archive this ${noun}? It disappears from lists but keeps its history. You can restore it later.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archive" value={archived ? "false" : "true"} />
      <SubmitButton variant={archived ? "outline" : "ghost"} size={size} pendingText={archived ? "Restoring" : "Archiving"}>
        {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        {archived ? "Restore" : "Archive"}
      </SubmitButton>
      {state.message && !state.ok ? <p className="mt-1 text-[13px] text-brand-deep">{state.message}</p> : null}
    </form>
  );
}
