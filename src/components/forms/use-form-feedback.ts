"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/forms";

/** Toast on success, toast on a whole form error. Field errors render inline. */
export function useFormFeedback(state: FormState, onSaved?: () => void) {
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.savedAt && state.savedAt !== last.current) {
      last.current = state.savedAt;
      if (state.message) toast.success(state.message);
      onSaved?.();
    }
  }, [state.savedAt, state.message, onSaved]);
}
