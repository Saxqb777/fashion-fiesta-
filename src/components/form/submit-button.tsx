"use client";

import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFormPending } from "./action-form";

export function SubmitButton({
  children,
  pendingText,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending: nativePending } = useFormStatus();
  const formPending = useActionFormPending();
  const pending = nativePending || formPending;
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
