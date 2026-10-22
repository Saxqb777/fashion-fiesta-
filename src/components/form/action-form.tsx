"use client";

import { createContext, useContext, useTransition } from "react";

const PendingContext = createContext(false);

export function useActionFormPending() {
  return useContext(PendingContext);
}

/**
 * A form that runs a server action without React's automatic reset,
 * so a failed save keeps everything the person typed.
 */
export function ActionForm({
  action,
  children,
  ...rest
}: Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & { action: (fd: FormData) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <PendingContext.Provider value={pending}>
      <form
        {...rest}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
      >
        {children}
      </form>
    </PendingContext.Provider>
  );
}
